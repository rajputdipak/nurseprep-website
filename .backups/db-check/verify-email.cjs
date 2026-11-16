const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
let checks = 0;
const pass = label => { checks++; console.log(`PASS ${label}`); };
const cache = new Map();
function load(relative, extra = {}) {
  if (cache.has(relative)) return cache.get(relative);
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const customRequire = name => {
    if (name === '@/lib/payment-types') return load('lib/payment-types.ts');
    if (name === 'nodemailer') return require(path.join(root, 'node_modules/nodemailer'));
    if (extra[name]) return extra[name];
    throw new Error(`Unexpected dependency: ${name}`);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: relative })(customRequire, module, module.exports);
  cache.set(relative, module.exports);
  return module.exports;
}
async function main() {
  const emails = load('lib/payment-emails.ts');
  const payment = {
    id: '33333333-3333-4333-8333-333333333333',
    plan_name: 'Monthly',
    amount: 299.5,
    duration_days: 30,
    utr: '012345678901',
    created_at: '2026-11-11T10:00:00.000Z',
  };
  const student = { full_name: 'Ravi <script>alert(1)</script>', email: 'ravi@example.com' };
  const site = 'https://nurseprep.test';

  const adminMail = emails.buildAdminPaymentEmail(payment, student, site);
  assert.ok(adminMail.subject.startsWith('New UPI payment submitted'), adminMail.subject);
  assert.ok(adminMail.subject.includes('299.50'));
  assert.ok(adminMail.subject.includes('Monthly'));
  for (const expected of ['ravi@example.com', 'Monthly', '30 days', '012345678901', payment.id, `${site}/admin/payments`, 'Ravi']) {
    assert.ok(adminMail.text.includes(expected), `admin text missing ${expected}`);
  }
  assert.ok(adminMail.text.includes('₹'), 'admin text shows the INR amount');
  assert.ok(!adminMail.html.includes('<script>'), 'admin html escapes student-supplied text');
  assert.ok(adminMail.html.includes('&lt;script&gt;'));
  assert.ok(adminMail.html.includes(`${site}/admin/payments`));
  pass('Admin email names the student, plan, amount, UTR and review link, with escaped HTML');

  const access = { starts_at: '2026-11-12T04:00:00.000Z', ends_at: '2026-12-12T04:00:00.000Z' };
  const verified = emails.buildStudentPaymentEmail(payment, student, 'verified', access, site);
  assert.ok(verified.subject.startsWith('Payment verified'));
  assert.ok(verified.subject.includes('Dec 2026'), verified.subject);
  for (const expected of ['012345678901', 'Monthly', '299.50', `${site}/dashboard`, 'Verified']) {
    assert.ok(verified.text.toLowerCase().includes(expected.toLowerCase()), `verified text missing ${expected}`);
  }
  assert.ok(verified.text.includes('–'), 'verified text shows the access window');
  assert.ok(verified.html.includes(`${site}/dashboard`));
  assert.ok(!verified.html.includes('<script>'));
  pass('Verified student email shows the plan, amount, UTR, access window and dashboard link');

  const rejected = emails.buildStudentPaymentEmail(payment, student, 'rejected', null, site);
  assert.ok(rejected.subject.startsWith('Payment not verified'));
  assert.ok(rejected.text.includes('could not verify'));
  assert.ok(rejected.text.includes('012345678901'));
  assert.ok(!rejected.text.includes('Access:'));
  assert.ok(rejected.html.includes(`${site}/payments`));
  pass('Rejected student email explains the failure, repeats the UTR, and offers a status link');

  const missing = emails.buildAdminPaymentEmail(
    { ...payment, utr: null, plan_name: null, created_at: null },
    { full_name: null, email: null },
    site
  );
  assert.ok(missing.text.includes('Student (email unavailable)'));
  assert.ok(missing.text.includes('not submitted'));
  assert.ok(missing.text.includes('NursePrep plan'));
  assert.ok(missing.text.includes('Date unavailable'));
  pass('Missing student, UTR, plan and timestamp produce safe fallbacks instead of blanks');

  for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM']) delete process.env[key];
  const mailer = load('lib/email.ts');
  assert.equal(mailer.isEmailConfigured(), false);
  assert.deepEqual(mailer.normalizeRecipients(['A@B.com', ' a@b.com ', 'bad', null, 'c@d.in']), ['a@b.com', 'c@d.in']);
  assert.equal(await mailer.sendEmail({ to: ['ravi@example.com'], subject: 'test', text: 'x', html: 'x' }), false);
  process.env.SMTP_HOST = 'smtp.example.test'; process.env.SMTP_USER = 'sender@example.test';
  assert.equal(mailer.isEmailConfigured(), false, 'password is required');
  process.env.SMTP_PASS = 'app-password';
  assert.equal(mailer.isEmailConfigured(), true);
  assert.equal(await mailer.sendEmail({ to: ['not-an-email'], subject: 'test', text: 'x', html: 'x' }), false);
  for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) delete process.env[key];
  pass('Email transport stays disabled without full SMTP config and filters invalid recipients');

  console.log(`${checks} payment email checks passed; no network or build used.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
