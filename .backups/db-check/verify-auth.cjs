const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));

let checks = 0;
const pass = (label) => { checks++; console.log(`PASS ${label}`); };

// ---------- environment mocks ----------
process.env.AUTH_OTP_SECRET = 'test-only-otp-cookie-secret';

const jar = new Map();
let lastCookieOptions = null;
const headersMock = {
  cookies: () => ({
    get: (name) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name, value, options) => { jar.set(name, value); lastCookieOptions = options; },
    delete: (name) => { jar.delete(name); },
  }),
};

const shared = new Map();
function loadShared(relative) {
  if (shared.has(relative)) return shared.get(relative);
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const customRequire = (name) => {
    if (name === 'crypto') return require('node:crypto');
    if (name === 'next/headers') return headersMock;
    if (name === 'next/server') return { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), { status: (init && init.status) || 200, headers: (init && init.headers) || {} }) } };
    if (name === '@/lib/auth-api') return loadShared('lib/auth-api.ts');
    if (name === '@/lib/auth-cookies') return loadShared('lib/auth-cookies.ts');
    if (name === '@/lib/auth-rate-limit') return loadShared('lib/auth-rate-limit.ts');
    if (name === '@/lib/password-policy') return loadShared('lib/password-policy.ts');
    if (name === '@/lib/security/device-trust') return loadShared('lib/security/device-trust.ts');
    throw new Error(`Unexpected dependency: ${name}`);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: relative })(customRequire, module, module.exports);
  shared.set(relative, module.exports);
  return module.exports;
}

function loadRoute(relative, supabase) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const customRequire = (name) => {
    if (name === 'next/headers') return headersMock;
    if (name === 'next/server') return { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), { status: (init && init.status) || 200, headers: (init && init.headers) || {} }) } };
    if (name === '@/lib/auth-api') return loadShared('lib/auth-api.ts');
    if (name === '@/lib/auth-cookies') return loadShared('lib/auth-cookies.ts');
    if (name === '@/lib/auth-rate-limit') return loadShared('lib/auth-rate-limit.ts');
    if (name === '@/lib/password-policy') return loadShared('lib/password-policy.ts');
    if (name === '@/lib/security/device-trust') return loadShared('lib/security/device-trust.ts');
    if (name === '@/lib/supabase/server') return { createClient: () => supabase.client };
    throw new Error(`Unexpected dependency: ${name}`);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: relative })(customRequire, module, module.exports);
  return module.exports;
}

function supabaseMock(overrides = {}) {
  const calls = [];
  const pick = (key, fallback) => (key in overrides ? overrides[key] : fallback);
  const client = {
    auth: {
      signInWithPassword: async (args) => { calls.push({ auth: 'signInWithPassword', args }); return pick('signInWithPassword', { data: { user: { id: 'user-1' } }, error: null }); },
      signInWithOtp: async (args) => { calls.push({ auth: 'signInWithOtp', args }); return pick('signInWithOtp', { error: null }); },
      verifyOtp: async (args) => { calls.push({ auth: 'verifyOtp', args }); return pick('verifyOtp', { data: { user: { id: 'user-1' } }, error: null }); },
      updateUser: async (args) => { calls.push({ auth: 'updateUser', args }); return pick('updateUser', { error: null }); },
      reauthenticate: async () => { calls.push({ auth: 'reauthenticate' }); return pick('reauthenticate', { error: null }); },
      signOut: async (args) => { calls.push({ auth: 'signOut', args }); return { error: null }; },
      getUser: async () => pick('getUser', { data: { user: { id: 'user-1', email: 'student@example.com' } } }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => pick('profile', { data: { role: 'user' }, error: null }) }) }) }),
  };
  return { client, calls };
}

function post(pathname, body, options = {}) {
  const headers = {
    'content-type': 'application/json',
    host: 'local.test',
    origin: 'http://local.test',
    'x-forwarded-for': '203.0.113.9',
    ...(options.headers || {}),
  };
  const init = { method: 'POST', headers };
  if (body !== undefined) init.body = options.raw ? body : JSON.stringify(body);
  return new Request(`http://local.test${pathname}`, init);
}

async function call(handler, request) {
  const response = await handler(request);
  return { status: response.status, body: await response.json(), headers: response.headers };
}

const api = loadShared('lib/auth-api.ts');
const policy = loadShared('lib/password-policy.ts');
const limits = loadShared('lib/auth-rate-limit.ts');
const cookies = loadShared('lib/auth-cookies.ts');

function resetState() {
  jar.clear();
  lastCookieOptions = null;
  limits.resetAuthLimits();
}

async function main() {
  // ---------- password policy ----------
  assert.equal(policy.passwordProblem('short1'), 'Password must be at least 8 characters');
  assert.equal(policy.passwordProblem('abcdefgh'), 'Password must include at least one letter and one number');
  assert.equal(policy.passwordProblem('12345678'), 'Password must include at least one letter and one number');
  assert.equal(policy.passwordProblem('a'.repeat(71) + '1'), null);
  assert.equal(policy.passwordProblem('a'.repeat(72) + '1'), 'Password must be at most 72 characters');
  assert.equal(policy.passwordProblem('Nurse1234'), null);
  pass('Password policy enforces 8–72 characters with at least one letter and one number');

  // ---------- rate limiting ----------
  limits.resetAuthLimits();
  for (let attempt = 1; attempt <= 5; attempt++) assert.ok(limits.consumeAttempt('k').allowed, `attempt ${attempt}`);
  const blocked = limits.consumeAttempt('k');
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0);
  limits.clearAttempts('k');
  assert.ok(limits.consumeAttempt('k').allowed);
  assert.ok(limits.consumeAttempt('window', 1, 0).allowed);
  assert.ok(limits.consumeAttempt('window', 1, 0).allowed);
  assert.equal(limits.inCooldown('c'), false);
  limits.startCooldown('c');
  assert.equal(limits.inCooldown('c'), true);
  limits.endCooldown('c');
  assert.equal(limits.inCooldown('c'), false);
  pass('Attempt limits block the 6th try, clear on success, and cooldowns start and end');

  // ---------- auth-api helpers ----------
  assert.equal(api.normalizeEmail('  Student@Example.COM '), 'student@example.com');
  assert.equal(api.normalizeEmail('bad'), null);
  assert.equal(api.normalizeEmail(42), null);
  assert.equal(api.normalizeOtp(' 123 456 '), '123456');
  assert.equal(api.normalizeOtp('12345'), null);
  assert.equal(api.normalizeOtp('12345678901'), null);
  assert.equal(api.normalizeOtp('12345a'), null);
  assert.equal(api.safeNextPath('/dashboard'), '/dashboard');
  for (const bad of ['//evil.test', 'https://evil.test', '/a\\b', '', null, 7]) assert.equal(api.safeNextPath(bad), null, String(bad));
  assert.ok(api.isRateLimitError({ status: 429 }));
  assert.ok(api.isRateLimitError({ message: 'email rate limit exceeded' }));
  assert.ok(!api.isRateLimitError({ message: 'invalid password' }));
  assert.ok(api.isUnknownUserError({ message: 'User not found' }));
  assert.ok(!api.isUnknownUserError({ message: 'smtp connection refused' }));
  assert.equal(api.authJson({ ok: true }).headers.get('cache-control'), 'no-store');
  api.assertSameOrigin(post('/x', {}));
  assert.throws(() => api.assertSameOrigin(post('/x', {}, { headers: { origin: 'http://evil.test' } })),
    (error) => error.status === 403);
  assert.doesNotThrow(() => api.assertSameOrigin(new Request('http://local.test/x', { method: 'POST' })));

  const parsed = await api.readAuthBody(post('/x', { email: 'a@b.com' }), ['email']);
  assert.deepEqual(parsed, { email: 'a@b.com' });
  await assert.rejects(() => api.readAuthBody(post('/x', { email: 'a@b.com', admin: true }), ['email']),
    (error) => error.status === 400);
  await assert.rejects(() => api.readAuthBody(post('/x', '{broken', { raw: true }), ['email']),
    (error) => error.status === 400);
  await assert.rejects(() => api.readAuthBody(post('/x', { password: 'x'.repeat(5000) }), ['password']),
    (error) => error.status === 413);
  pass('Email/OTP/next normalization, same-origin guard, 4KB body cap, field allowlist and no-store JSON');

  // ---------- signed pending cookie ----------
  resetState();
  cookies.setOtpCookie('login', 'student@example.com', '/exam/1');
  assert.equal(lastCookieOptions.httpOnly, true);
  assert.equal(lastCookieOptions.sameSite, 'lax');
  assert.equal(lastCookieOptions.path, '/');
  assert.equal(lastCookieOptions.maxAge, 600);
  assert.equal(lastCookieOptions.secure, false);
  assert.deepEqual(cookies.readOtpCookie('login'), { email: 'student@example.com', next: '/exam/1' });
  assert.equal(cookies.readOtpCookie('reset'), null);
  cookies.setOtpCookie('reset', 'student@example.com');
  assert.deepEqual(cookies.readOtpCookie('reset'), { email: 'student@example.com', next: null });
  const raw = jar.get('np_login_otp');
  jar.set('np_login_otp', raw.slice(0, -1) + (raw.endsWith('A') ? 'B' : 'A'));
  assert.equal(cookies.readOtpCookie('login'), null);
  cookies.clearOtpCookie('reset');
  assert.equal(jar.has('np_reset_otp'), false);
  pass('Pending OTP cookie is HttpOnly, SameSite=Lax, 10 minutes, purpose-bound and tamper-proof');

  // ---------- login route ----------
  resetState();
  let mock = supabaseMock();
  let handler = loadRoute('app/api/auth/login/route.ts', mock).POST;
  let res = await call(handler, post('/api/auth/login', { email: ' Student@Example.com ', password: 'Nurse1234', next: '/exam/1' }));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { otp_sent: true, email: 'student@example.com' });
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(mock.calls.map((item) => item.auth), ['signInWithPassword', 'signOut', 'signInWithOtp']);
  assert.equal(mock.calls[1].args.scope, 'local');
  assert.deepEqual(mock.calls[2].args, { email: 'student@example.com', options: { shouldCreateUser: false } });
  assert.deepEqual(cookies.readOtpCookie('login'), { email: 'student@example.com', next: '/exam/1' });
  pass('Login verifies the password, discards that session, emails a code and stores a safe pending cookie');

  resetState();
  mock = supabaseMock({ signInWithPassword: { data: { user: null }, error: { message: 'Invalid login credentials' } } });
  handler = loadRoute('app/api/auth/login/route.ts', mock).POST;
  res = await call(handler, post('/api/auth/login', { email: 'a@b.com', password: 'whatever1' }));
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Invalid email or password');
  assert.ok(!mock.calls.some((item) => item.auth === 'signInWithOtp'));

  resetState();
  mock = supabaseMock({ signInWithPassword: { data: { user: null }, error: { message: 'Email not confirmed' } } });
  handler = loadRoute('app/api/auth/login/route.ts', mock).POST;
  res = await call(handler, post('/api/auth/login', { email: 'a@b.com', password: 'whatever1' }));
  assert.equal(res.status, 403);
  assert.match(res.body.error, /Confirm your email/);
  pass('Wrong passwords stay generic and unconfirmed emails get a clear 403 without sending a code');

  resetState();
  mock = supabaseMock({ signInWithPassword: { data: { user: null }, error: { message: 'Invalid login credentials' } } });
  handler = loadRoute('app/api/auth/login/route.ts', mock).POST;
  for (let attempt = 1; attempt <= 5; attempt++) {
    res = await call(handler, post('/api/auth/login', { email: 'a@b.com', password: 'whatever1' }));
    assert.equal(res.status, 401, `attempt ${attempt}`);
  }
  res = await call(handler, post('/api/auth/login', { email: 'a@b.com', password: 'whatever1' }));
  assert.equal(res.status, 429);
  assert.equal(mock.calls.length, 5);
  pass('Five failed logins per IP+email trigger a 429 before the next password check');

  resetState();
  mock = supabaseMock({ signInWithOtp: { error: { message: 'smtp down' } } });
  handler = loadRoute('app/api/auth/login/route.ts', mock).POST;
  res = await call(handler, post('/api/auth/login', { email: 'a@b.com', password: 'Nurse1234' }));
  assert.equal(res.status, 502);
  assert.ok(!jar.has('np_login_otp'));
  assert.equal(limits.inCooldown('otp-send:a@b.com'), false);
  pass('An OTP email failure returns 502, sets no cookie and releases the resend cooldown');

  resetState();
  mock = supabaseMock();
  handler = loadRoute('app/api/auth/login/route.ts', mock).POST;
  res = await call(handler, post('/api/auth/login', { email: 'a@b.com', password: 'Nurse1234' }, { headers: { origin: 'http://evil.test' } }));
  assert.equal(res.status, 403);
  assert.equal(mock.calls.length, 0);
  res = await call(handler, post('/api/auth/login', { email: 'a@b.com', password: 'x'.repeat(5000) }));
  assert.equal(res.status, 413);
  res = await call(handler, post('/api/auth/login', { email: 'not-an-email', password: 'Nurse1234' }));
  assert.equal(res.status, 400);
  pass('Login rejects cross-origin posts, oversized bodies and malformed emails before touching auth');

  // ---------- verify route ----------
  resetState();
  mock = supabaseMock();
  handler = loadRoute('app/api/auth/verify/route.ts', mock).POST;
  res = await call(handler, post('/api/auth/verify', { token: '123456' }));
  assert.equal(res.status, 400);
  assert.match(res.body.error, /expired/);

  cookies.setOtpCookie('login', 'student@example.com', '/exam/1');
  res = await call(handler, post('/api/auth/verify', { token: '12 34 56' }));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { next: '/exam/1' });
  assert.deepEqual(mock.calls[0].args, { email: 'student@example.com', token: '123456', type: 'email' });
  assert.equal(jar.has('np_login_otp'), false);
  pass('Login verification requires a pending cookie, normalizes the spaced code and follows the safe next path');

  resetState();
  mock = supabaseMock({ verifyOtp: { data: { user: null }, error: { message: 'Token has expired' } } });
  handler = loadRoute('app/api/auth/verify/route.ts', mock).POST;
  cookies.setOtpCookie('login', 'student@example.com');
  res = await call(handler, post('/api/auth/verify', { token: '123456' }));
  assert.equal(res.status, 401);
  assert.match(res.body.error, /Invalid or expired code/);
  for (let attempt = 2; attempt <= 5; attempt++) await call(handler, post('/api/auth/verify', { token: '123456' }));
  res = await call(handler, post('/api/auth/verify', { token: '123456' }));
  assert.equal(res.status, 429);
  pass('Wrong login codes are limited to five attempts and expire without granting a session');

  resetState();
  mock = supabaseMock({ profile: { data: { role: 'admin' }, error: null } });
  handler = loadRoute('app/api/auth/verify/route.ts', mock).POST;
  cookies.setOtpCookie('login', 'admin@example.com');
  res = await call(handler, post('/api/auth/verify', { token: '123456' }));
  assert.deepEqual(res.body, { next: '/admin' });
  pass('OTP login falls back to the role dashboard (/admin) instead of always /dashboard');

  // ---------- forgot route ----------
  resetState();
  mock = supabaseMock();
  handler = loadRoute('app/api/auth/forgot/route.ts', mock).POST;
  res = await call(handler, post('/api/auth/forgot', { email: 'Student@Example.com' }));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { sent: true, email: 'student@example.com' });
  assert.deepEqual(mock.calls[0].args, { email: 'student@example.com', options: { shouldCreateUser: false } });
  assert.deepEqual(cookies.readOtpCookie('reset'), { email: 'student@example.com', next: null });

  resetState();
  mock = supabaseMock({ signInWithOtp: { error: { message: 'User not found' } } });
  handler = loadRoute('app/api/auth/forgot/route.ts', mock).POST;
  res = await call(handler, post('/api/auth/forgot', { email: 'ghost@example.com' }));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { sent: true, email: 'ghost@example.com' });
  assert.deepEqual(cookies.readOtpCookie('reset'), { email: 'ghost@example.com', next: null });

  resetState();
  mock = supabaseMock({ signInWithOtp: { error: { status: 429, message: 'over_email_send_rate_limit' } } });
  handler = loadRoute('app/api/auth/forgot/route.ts', mock).POST;
  res = await call(handler, post('/api/auth/forgot', { email: 'student@example.com' }));
  assert.equal(res.status, 429);

  resetState();
  mock = supabaseMock({ signInWithOtp: { error: { message: 'smtp down' } } });
  handler = loadRoute('app/api/auth/forgot/route.ts', mock).POST;
  res = await call(handler, post('/api/auth/forgot', { email: 'student@example.com' }));
  assert.equal(res.status, 502);
  assert.ok(!jar.has('np_reset_otp'));
  res = await call(handler, post('/api/auth/forgot', { email: 'bad' }));
  assert.equal(res.status, 400);
  pass('Forgot password answers identically for unknown accounts and only reveals rate-limit or outage states');

  // ---------- reset route ----------
  resetState();
  mock = supabaseMock();
  handler = loadRoute('app/api/auth/reset/route.ts', mock).POST;
  res = await call(handler, post('/api/auth/reset', { token: '123456', password: 'Nurse1234' }));
  assert.equal(res.status, 400);
  assert.match(res.body.error, /expired/);

  cookies.setOtpCookie('reset', 'student@example.com');
  res = await call(handler, post('/api/auth/reset', { token: '123456', password: 'short1' }));
  assert.equal(res.status, 400);
  assert.equal(mock.calls.length, 0);

  mock = supabaseMock({ verifyOtp: { data: { user: null }, error: { message: 'Token has expired' } } });
  handler = loadRoute('app/api/auth/reset/route.ts', mock).POST;
  res = await call(handler, post('/api/auth/reset', { token: '123456', password: 'Nurse1234' }));
  assert.equal(res.status, 401);
  assert.ok(!mock.calls.some((item) => item.auth === 'updateUser'));

  resetState();
  mock = supabaseMock();
  handler = loadRoute('app/api/auth/reset/route.ts', mock).POST;
  cookies.setOtpCookie('reset', 'student@example.com');
  res = await call(handler, post('/api/auth/reset', { token: '123456', password: 'Nurse1234' }));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { reset: true });
  assert.deepEqual(mock.calls.map((item) => item.auth), ['verifyOtp', 'updateUser', 'signOut']);
  assert.deepEqual(mock.calls[1].args, { password: 'Nurse1234' });
  assert.equal(mock.calls[2].args.scope, 'global');
  assert.equal(jar.has('np_reset_otp'), false);

  resetState();
  mock = supabaseMock({ updateUser: { error: { message: 'New password should be different from the old password.' } } });
  handler = loadRoute('app/api/auth/reset/route.ts', mock).POST;
  cookies.setOtpCookie('reset', 'student@example.com');
  res = await call(handler, post('/api/auth/reset', { token: '123456', password: 'Nurse1234' }));
  assert.equal(res.status, 400);
  assert.match(res.body.error, /different from your current one/);
  pass('Reset validates the code and password policy, revokes all sessions and rejects password reuse');

  // ---------- resend route ----------
  resetState();
  mock = supabaseMock();
  handler = loadRoute('app/api/auth/otp/resend/route.ts', mock).POST;
  res = await call(handler, post('/api/auth/otp/resend', {}));
  assert.equal(res.status, 400);

  cookies.setOtpCookie('login', 'student@example.com', '/exam/1');
  res = await call(handler, post('/api/auth/otp/resend', {}));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { sent: true });
  assert.equal(mock.calls.length, 1);
  assert.deepEqual(cookies.readOtpCookie('login'), { email: 'student@example.com', next: '/exam/1' });
  res = await call(handler, post('/api/auth/otp/resend', {}));
  assert.equal(res.status, 429);
  assert.equal(mock.calls.length, 1);

  resetState();
  mock = supabaseMock({ signInWithOtp: { error: { message: 'User not found' } } });
  handler = loadRoute('app/api/auth/otp/resend/route.ts', mock).POST;
  cookies.setOtpCookie('reset', 'ghost@example.com');
  res = await call(handler, post('/api/auth/otp/resend', {}));
  assert.equal(res.status, 200);
  pass('Resend obeys the 60-second cooldown, refreshes the right cookie, and hides unknown accounts');

  // ---------- change password start ----------
  resetState();
  mock = supabaseMock({ getUser: { data: { user: null } } });
  handler = loadRoute('app/api/auth/change-password/start/route.ts', mock).POST;
  res = await call(handler, post('/api/auth/change-password/start', {}));
  assert.equal(res.status, 401);
  assert.equal(mock.calls.length, 0);

  mock = supabaseMock();
  handler = loadRoute('app/api/auth/change-password/start/route.ts', mock).POST;
  res = await call(handler, post('/api/auth/change-password/start', {}));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { sent: true });
  assert.deepEqual(mock.calls.map((item) => item.auth), ['reauthenticate']);
  res = await call(handler, post('/api/auth/change-password/start', {}));
  assert.equal(res.status, 429);
  assert.equal(mock.calls.length, 1);

  resetState();
  mock = supabaseMock({ reauthenticate: { error: { message: 'reauthentication disabled' } } });
  handler = loadRoute('app/api/auth/change-password/start/route.ts', mock).POST;
  res = await call(handler, post('/api/auth/change-password/start', {}));
  assert.equal(res.status, 502);
  assert.equal(limits.inCooldown('otp-send:cp:user-1'), false);
  pass('Change-password start requires a session, emails a reauthentication nonce and throttles resends');

  // ---------- change password finish ----------
  resetState();
  mock = supabaseMock({ getUser: { data: { user: null } } });
  handler = loadRoute('app/api/auth/change-password/finish/route.ts', mock).POST;
  res = await call(handler, post('/api/auth/change-password/finish', { nonce: '123456', password: 'Nurse1234' }));
  assert.equal(res.status, 401);

  mock = supabaseMock();
  handler = loadRoute('app/api/auth/change-password/finish/route.ts', mock).POST;
  res = await call(handler, post('/api/auth/change-password/finish', { nonce: '12', password: 'Nurse1234' }));
  assert.equal(res.status, 400);
  res = await call(handler, post('/api/auth/change-password/finish', { nonce: '123456', password: 'nodigits' }));
  assert.equal(res.status, 400);
  assert.equal(mock.calls.length, 0);

  mock = supabaseMock({ updateUser: { error: { message: 'Reauthentication nonce is invalid or has expired' } } });
  handler = loadRoute('app/api/auth/change-password/finish/route.ts', mock).POST;
  res = await call(handler, post('/api/auth/change-password/finish', { nonce: '123456', password: 'Nurse1234' }));
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Invalid or expired code/);

  mock = supabaseMock();
  handler = loadRoute('app/api/auth/change-password/finish/route.ts', mock).POST;
  res = await call(handler, post('/api/auth/change-password/finish', { nonce: '123456', password: 'Nurse1234' }));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { updated: true });
  assert.deepEqual(mock.calls.map((item) => item.auth), ['updateUser', 'signOut']);
  assert.deepEqual(mock.calls[0].args, { password: 'Nurse1234', nonce: '123456' });
  assert.equal(mock.calls[1].args.scope, 'others');
  pass('Change-password finish requires the emailed nonce, enforces policy and signs out other devices');

  console.log(`\n${checks} auth checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
