const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const qr = require(path.join(root, 'node_modules/qrcode'));
const userId = '11111111-1111-4111-8111-111111111111';
const planId = '22222222-2222-4222-8222-222222222222';
const paymentId = '33333333-3333-4333-8333-333333333333';
const payment = { id: paymentId, user_id: userId, plan_id: planId, amount: 299.5, duration_days: 30, plan_name: 'Monthly', upi_id: 'nurseprep@bank', payee_name: 'Nurse Prep & Training', status: 'pending', utr: null };
let state;
let checks = 0;
const pass = label => { checks++; console.log(`PASS ${label}`); };
const reset = overrides => { state = { user: { id: userId }, role: 'admin', rpcError: null, tableError: null, calls: [], emails: [], payment: { ...payment }, ...overrides }; };
const access = { starts_at: '2026-11-12T04:00:00.000Z', ends_at: '2026-12-12T04:00:00.000Z' };
const notifications = {
  notifyAdminsOfPaymentSubmitted: async (submitted, student) => { state.emails.push({ kind: 'admin', payment: submitted, student }); },
  notifyStudentOfPaymentReview: async (reviewed, student, decision, window) => { state.emails.push({ kind: 'student', payment: reviewed, student, decision, access: window }); },
};
const client = {
  auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
  rpc: async (name, args) => {
    state.calls.push({ rpc: name, args });
    if (name === 'submit_payment_utr') state.payment.utr = args.p_utr;
    return { data: name === 'has_test_access' ? true : paymentId, error: state.rpcError };
  },
  from(table) {
    const call = { table, filters: [] }; state.calls.push(call);
    const finish = async () => ({
      data: table === 'profiles' ? { role: state.role, full_name: 'Test Student', email: 'student@example.test' }
        : table === 'payments' ? state.payment
        : table === 'user_plans' ? access
        : table === 'plans' ? { id: planId, ...call.update }
        : { ...call.upsert },
      error: table === 'profiles' ? null : state.tableError,
    });
    const builder = {
      select(columns) { call.select = columns; return builder; },
      eq(key, value) { call.filters.push([key, value]); return builder; },
      update(value) { call.update = value; return builder; },
      upsert(value) { call.upsert = value; return builder; },
      single: finish, maybeSingle: finish,
    };
    return builder;
  },
};
const cache = new Map();
function load(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const customRequire = name => {
    if (name === 'next/server') return { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } }) } };
    if (name === '@/lib/supabase/server') return { createClient: () => client };
    if (name === '@/lib/payment-api') return load('lib/payment-api.ts');
    if (name === '@/lib/payment-notifications') return notifications;
    if (name === 'qrcode') return qr;
    throw new Error(`Unexpected dependency: ${name}`);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: relative })(customRequire, module, module.exports);
  cache.set(relative, module.exports);
  return module.exports;
}
const routes = {
  checkout: load('app/api/payments/checkout/route.ts').POST,
  utr: load('app/api/payments/[id]/utr/route.ts').POST,
  review: load('app/api/admin/payments/[id]/review/route.ts').POST,
  settings: load('app/api/admin/payment-settings/route.ts').POST,
  plans: load('app/api/admin/plans/[id]/route.ts').POST,
};
const valid = {
  checkout: { plan_id: planId }, utr: { utr: '123456789012' },
  review: { decision: 'verified', note: 'Received in bank', confirm_received: true },
  settings: { upi_id: 'nurseprep@bank', payee_name: 'Nurse Prep', is_enabled: true },
  plans: { price: 299.99, duration_days: 30, is_active: true },
};
async function request(route, body = valid[route], id = route === 'plans' ? planId : paymentId) {
  const response = await routes[route](new Request('http://local.test/api/fixture', { method: 'POST', body: JSON.stringify(body) }), { params: { id } });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
async function main() {
  reset();
  let response = await request('checkout');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(response.body.payment, payment);
  assert.match(response.body.qr_data_url, /^data:image\/png;base64,iVBOR/);
  const uri = new URL(response.body.upi_uri);
  assert.equal(uri.protocol, 'upi:'); assert.equal(uri.hostname, 'pay');
  assert.equal(uri.searchParams.get('pa'), payment.upi_id);
  assert.equal(uri.searchParams.get('pn'), payment.payee_name);
  assert.equal(uri.searchParams.get('am'), '299.50');
  assert.equal(uri.searchParams.get('cu'), 'INR');
  assert.equal(uri.searchParams.get('tn'), `NursePrep ${paymentId}`);
  assert.deepEqual(state.calls[0], { rpc: 'create_payment_request', args: { p_plan_id: planId } });
  assert.deepEqual(state.calls[1].filters, [['id', paymentId], ['user_id', userId]]);
  pass('Checkout calls RPC before owner-scoped snapshot read and generates a real local PNG QR');
  reset(); response = await request('utr', { utr: '  012345678901  ' });
  assert.equal(response.status, 200); assert.deepEqual(response.body, { payment_id: paymentId });
  assert.equal(state.calls[0].args.p_utr, '012345678901');
  assert.equal(state.emails.length, 1);
  assert.equal(state.emails[0].kind, 'admin');
  assert.equal(state.emails[0].payment.id, paymentId);
  assert.equal(state.emails[0].payment.utr, '012345678901');
  assert.equal(state.emails[0].student.email, 'student@example.test');
  pass('UTR route trims input, calls the UTR RPC, then emails admins with the submitted UTR');
  reset(); response = await request('review');
  assert.equal(response.status, 200); assert.equal(state.calls[0].table, 'profiles');
  assert.equal(state.calls[1].rpc, 'review_payment');
  assert.deepEqual(state.calls[1].args, { p_payment_id: paymentId, p_decision: 'verified', p_note: 'Received in bank' });
  assert.equal(state.emails.length, 1);
  assert.equal(state.emails[0].kind, 'student');
  assert.equal(state.emails[0].decision, 'verified');
  assert.deepEqual(state.emails[0].access, access);
  assert.equal(state.emails[0].student.email, 'student@example.test');
  pass('Review checks server role, uses the review RPC, then emails the student the access window');
  for (const confirm_received of [undefined, false, 'true', 1]) {
    reset(); assert.equal((await request('review', { decision: 'verified', confirm_received })).status, 400);
    assert.ok(!state.calls.some(c => c.rpc === 'review_payment'));
  }
  reset(); assert.equal((await request('review', { decision: 'rejected' })).status, 200);
  assert.equal(state.emails.length, 1);
  assert.equal(state.emails[0].kind, 'student');
  assert.equal(state.emails[0].decision, 'rejected');
  assert.equal(state.emails[0].access, null);
  pass('Verified review requires literal confirmation true; rejection works and emails without an access window');
  for (const name of Object.keys(routes)) {
    reset({ user: null }); assert.equal((await request(name)).status, 401);
    assert.equal(state.calls.length, 0);
    assert.equal(state.emails.length, 0);
  }
  for (const name of ['review', 'settings', 'plans']) {
    reset({ role: 'user' }); assert.equal((await request(name)).status, 403);
    assert.equal(state.calls.length, 1);
    assert.equal(state.emails.length, 0);
  }
  pass('All routes require authentication; admin routes reject students before mutation or email');
  for (const name of Object.keys(routes)) {
    reset({ rpcError: { code: 'PGRST202', message: 'private SQL/internal credential details' } });
    response = await request(name);
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, { error: 'Database update required: run upgrade-platform.sql' });
    assert.equal(state.emails.length, 0);
  }
  for (const code of ['42P01', '42703', '42883', 'PGRST204', 'PGRST205']) {
    reset({ tableError: { code, message: 'private schema details' } });
    response = await request('checkout'); assert.equal(response.status, 503);
    assert.equal(response.body.error, 'Database update required: run upgrade-platform.sql');
  }
  reset({ rpcError: { code: 'XX000', message: 'password=secret@example.invalid' } });
  response = await request('utr'); assert.equal(response.status, 500); assert.ok(!JSON.stringify(response.body).includes('secret'));
  assert.equal(state.emails.length, 0);
  pass('Missing RPC/table/column returns explicit 503; unknown errors never leak internals or send email');
  const invalidBodies = {
    checkout: [{ plan_id: 'not-a-uuid' }, { ...valid.checkout, amount: 1 }, { ...valid.checkout, user_id: userId }],
    utr: [{ utr: 123456789012 }, { utr: '12345678901x' }, { utr: '1'.repeat(65) }],
    review: [{ decision: 'approved' }, { ...valid.review, note: 'x'.repeat(501) }, { ...valid.review, note: null }],
    settings: [{ ...valid.settings, upi_id: 'not-upi' }, { ...valid.settings, payee_name: 'x'.repeat(101) }, { ...valid.settings, is_enabled: 'true' }, { ...valid.settings, payee_name: '' }],
    plans: [{ ...valid.plans, price: -1 }, { ...valid.plans, price: 100001 }, { ...valid.plans, price: 0.001 }, { ...valid.plans, price: Infinity }, { ...valid.plans, price: '299' }, { ...valid.plans, duration_days: 0 }, { ...valid.plans, duration_days: 1.5 }, { ...valid.plans, duration_days: 3651 }, { ...valid.plans, is_active: 1 }],
  };
  for (const [name, bodies] of Object.entries(invalidBodies)) for (const body of bodies) { reset(); assert.equal((await request(name, body)).status, 400, `${name}: ${JSON.stringify(body)}`); }
  for (const name of ['utr', 'review', 'plans']) { reset(); assert.equal((await request(name, valid[name], 'bad-id')).status, 400); }
  reset(); assert.equal((await request('checkout', null)).status, 400);
  reset(); assert.equal((await request('checkout', [])).status, 400);
  reset(); assert.equal((await request('checkout', { plan_id: 'x'.repeat(9000) })).status, 413);
  const invalidJson = await routes.checkout(new Request('http://local.test', { method: 'POST', body: '{ broken json' }));
  assert.equal(invalidJson.status, 400);
  pass('UUID, UTR, names, notes, price precision/range, duration, booleans, unknown fields, JSON, and body-size validations');
  for (const [price, duration_days] of [[0, 1], [100000, 3650], [0.01, 30]]) {
    reset(); assert.equal((await request('plans', { price, duration_days, is_active: true })).status, 200);
    assert.deepEqual(state.calls.find(c => c.update).update, { price, duration_days, is_active: true });
  }
  reset(); assert.equal((await request('settings', { upi_id: '', payee_name: '', is_enabled: false })).status, 200);
  assert.deepEqual(state.calls.find(c => c.upsert).upsert, { id: 1, upi_id: '', payee_name: '', is_enabled: false });
  pass('Boundary plan values and disabled blank settings accepted; settings always target singleton id=1');
  reset({ rpcError: { message: 'UTR_ALREADY_USED', code: 'P0001' } });
  assert.equal((await request('utr')).status, 409);
  reset({ rpcError: { message: 'ADMIN_REQUIRED', code: 'P0001' } });
  assert.equal((await request('review')).status, 403);
  pass('Known RPC failures receive safe actionable HTTP status codes');
  console.log(`${checks} mocked API checks passed; QR generation used installed qrcode locally. No server/network/build.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
