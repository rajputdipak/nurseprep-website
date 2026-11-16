const { test, assert, load } = require("./harness.cjs");

const v = load("lib/security/validation.ts");
const password = load("lib/password-policy.ts");

test("test_sql_injection_blocked_in_login", () => {
  assert.throws(() => v.assertSqlSafe("' OR 1=1 --", "email"), /unsafe SQL/);
  assert.doesNotThrow(() => v.assertSqlSafe("student@example.com", "email"));
});

test("test_sql_injection_blocked_in_search", () => {
  assert.throws(
    () => v.assertSqlSafe("%' UNION SELECT password FROM users --", "query"),
    /unsafe SQL/
  );
  assert.doesNotThrow(() => v.assertSqlSafe("nursing mcq", "query"));
});

test("test_xss_payload_escaped_in_response", () => {
  const escaped = v.escapeHtml("<img src=x onerror=alert(1)>");
  assert.ok(!escaped.includes("<img"));
  assert.ok(escaped.includes("&lt;img"));
});

test("test_xss_stored_blocked_in_complaint", () => {
  const stored = v.sanitizeStoredText("<script>alert(1)</script>");
  assert.ok(!stored.includes("<script"));
  assert.ok(stored.includes("&lt;script&gt;"));
});

test("test_prototype_pollution_rejected", () => {
  const payload = JSON.parse('{"__proto__":{"admin":true}}');
  assert.throws(() => v.assertNoPrototypePollution(payload), /forbidden key/);
});

test("test_json_depth_limit_exceeded", () => {
  let deep = { value: 1 };
  for (let i = 0; i < 12; i += 1) deep = { child: deep };
  assert.throws(() => v.assertJsonDepth(deep, 8), /nested too deeply/);
});

test("test_mass_assignment_forbidden_by_pydantic", () => {
  const accepted = v.pickAllowed(
    { email: "student@example.com", name: "Student", role: "admin" },
    ["email", "name"]
  );
  assert.deepEqual(accepted, { email: "student@example.com", name: "Student" });
  assert.equal("role" in accepted, false);
});

test("test_path_traversal_in_file_download", () => {
  assert.throws(() => v.assertSafeRelativePath("../../etc/passwd"), /traversal/);
  assert.throws(() => v.assertSafeRelativePath("/etc/passwd"), /Absolute/);
  assert.equal(v.assertSafeRelativePath("documents/report.pdf"), "documents/report.pdf");
});

test("test_command_injection_blocked", () => {
  assert.throws(() => v.assertSafeShellArg("report.pdf; rm -rf /"), /Shell metacharacters/);
  assert.throws(() => v.assertSafeShellArg("$(whoami)"), /Shell metacharacters/);
  assert.doesNotThrow(() => v.assertSafeShellArg("report.pdf"));
});

test("test_ssrf_private_ip_blocked", () => {
  assert.throws(() => v.assertSafeOutboundUrl("http://192.168.1.10/admin"), /private/);
  assert.throws(() => v.assertSafeOutboundUrl("http://127.0.0.1:5432"), /private/);
  assert.doesNotThrow(() => v.assertSafeOutboundUrl("https://example.com/webhook"));
});

test("test_ssrf_metadata_ip_blocked", () => {
  assert.throws(
    () => v.assertSafeOutboundUrl("http://169.254.169.254/latest/meta-data/"),
    /private/
  );
  assert.throws(
    () => v.assertSafeOutboundUrl("http://metadata.google.internal/computeMetadata/v1/"),
    /private/
  );
});

test("test_deserialization_payload_rejected", () => {
  assert.throws(
    () => v.parseJsonSecure('{"__proto__":{"isAdmin":true}}'),
    /forbidden key/
  );
  assert.deepEqual(v.parseJsonSecure('{"name":"student"}'), { name: "student" });
});

test("test_duplicate_query_parameters_rejected", () => {
  assert.throws(() => v.rejectDuplicateQuery("/search?q=a&q=b"), /Duplicate query/);
  assert.deepEqual(v.rejectDuplicateQuery("/search?q=nursing"), ["q"]);
});

test("test_invalid_upload_magic_bytes_rejected", () => {
  assert.throws(() => v.assertMagicBytes(Buffer.from("MZ executable"), "pdf"), /does not match/);
  assert.doesNotThrow(() => v.assertMagicBytes(Buffer.from("%PDF-1.7\n"), "pdf"));
});

test("test_upload_size_limit_exceeded", () => {
  assert.throws(() => v.assertUploadSize(6 * 1024 * 1024), /too large/);
  assert.doesNotThrow(() => v.assertUploadSize(1024));
});

test("test_email_format_validation", () => {
  assert.equal(v.isValidEmail("student@example.com"), true);
  assert.equal(v.isValidEmail("bad@"), false);
  assert.equal(v.isValidEmail("no-at-sign.example.com"), false);
});

test("test_password_policy_enforcement", () => {
  assert.ok(password.passwordProblem("short1"));
  assert.ok(password.passwordProblem("onlyletters"));
  assert.equal(password.passwordProblem("Password1"), null);
});

test("test_username_enumerations_denied_in_login", () => {
  const known = v.publicAuthError();
  const unknown = v.publicAuthError();
  assert.equal(known, unknown);
  assert.ok(!/not found|does not exist/i.test(known));
});

test("test_username_enumerations_denied_in_forgot_password", () => {
  const known = v.publicResetMessage();
  const unknown = v.publicResetMessage();
  assert.equal(known, unknown);
  assert.ok(!/not found|does not exist/i.test(known));
});

test("test_xxe_external_entity_blocked", () => {
  const payload = '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>';
  assert.throws(() => v.assertNoXxe(payload), /external entities/);
  assert.doesNotThrow(() => v.assertNoXxe("<document><name>test</name></document>"));
});
