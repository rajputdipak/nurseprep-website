const { test, assert, load, afterEach } = require("./harness.cjs");

const tokens = load("lib/security/tokens.ts");
const sessions = load("lib/security/sessions.ts");
const csrf = load("lib/security/csrf.ts");
const cors = load("lib/security/cors.ts");

afterEach(() => sessions.resetSessions());

const SECRET = "test-session-secret";

test("test_jwt_access_token_generation", () => {
  const token = tokens.signJwt(
    { sub: "user-1", sid: "session-1", did: "device-a" },
    SECRET,
    900
  );
  assert.equal(token.split(".").length, 3);
  const verified = tokens.verifyJwt(token, SECRET);
  assert.equal(verified.valid, true);
  assert.equal(verified.claims.sub, "user-1");
});

test("test_jwt_refresh_token_rotation", () => {
  const created = sessions.createSession({
    userId: "user-1",
    deviceId: "device-a",
    role: "user",
  });
  const next = sessions.rotateRefresh(created.refreshToken);
  assert.notEqual(next.refreshToken, created.refreshToken);
  assert.equal(sessions.validateSession(created.sessionId).valid, true);
});

test("test_jwt_refresh_replay_revokes_all_sessions", () => {
  const first = sessions.createSession({ userId: "user-1", deviceId: "a", role: "user" });
  const second = sessions.createSession({ userId: "user-1", deviceId: "b", role: "user" });
  sessions.rotateRefresh(first.refreshToken);
  assert.throws(() => sessions.rotateRefresh(first.refreshToken), /replay/i);
  assert.equal(sessions.validateSession(first.sessionId).valid, false);
  assert.equal(sessions.validateSession(second.sessionId).valid, false);
});

test("test_jwt_revoked_session_denies_access", () => {
  const created = sessions.createSession({ userId: "user-1", deviceId: "a", role: "user" });
  sessions.revokeSession(created.sessionId);
  const result = sessions.validateSession(created.sessionId);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "revoked");
});

test("test_logout_invalidates_refresh_token", () => {
  const created = sessions.createSession({ userId: "user-1", deviceId: "a", role: "user" });
  sessions.logout(created.sessionId);
  assert.throws(() => sessions.rotateRefresh(created.refreshToken));
  assert.equal(sessions.validateSession(created.sessionId).valid, false);
});

test("test_session_timeout_inactivity", () => {
  const created = sessions.createSession({
    userId: "user-1",
    deviceId: "a",
    role: "user",
    now: 0,
  });
  assert.equal(sessions.validateSession(created.sessionId, { now: 10 * 60_000 }).valid, true);
  const later = 10 * 60_000 + 31 * 60_000;
  const result = sessions.validateSession(created.sessionId, { now: later });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "inactivity_expired");
});

test("test_session_absolute_lifetime_expiry", () => {
  const created = sessions.createSession({
    userId: "user-1",
    deviceId: "a",
    role: "user",
    now: 0,
  });
  const result = sessions.validateSession(created.sessionId, {
    now: 12 * 3_600_000,
    inactivityMs: 365 * 24 * 3_600_000,
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "absolute_expired");
});

test("test_concurrent_session_limit_enforced", () => {
  for (let i = 0; i < 4; i += 1) {
    sessions.createSession({ userId: "user-1", deviceId: `device-${i}`, role: "user" });
  }
  const revoked = sessions.enforceConcurrentSessionLimit("user-1", 3);
  assert.equal(revoked.length, 1);
  assert.equal(sessions.activeSessions("user-1").length, 3);
});

test("test_session_bound_to_device_fingerprint", () => {
  const created = sessions.createSession({
    userId: "user-1",
    deviceId: "device-a",
    role: "user",
  });
  const result = sessions.validateSession(created.sessionId, { deviceId: "device-b" });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "device_mismatch");
});

test("test_password_change_kills_all_sessions", () => {
  const first = sessions.createSession({ userId: "user-1", deviceId: "a", role: "user" });
  const second = sessions.createSession({ userId: "user-1", deviceId: "b", role: "user" });
  sessions.onPasswordChange("user-1");
  assert.equal(sessions.validateSession(first.sessionId).valid, false);
  assert.equal(sessions.validateSession(second.sessionId).valid, false);
});

test("test_role_change_kills_all_sessions", () => {
  const first = sessions.createSession({ userId: "user-1", deviceId: "a", role: "user" });
  sessions.onRoleChange("user-1");
  assert.equal(sessions.validateSession(first.sessionId).valid, false);
});

test("test_account_disable_kills_all_sessions", () => {
  const first = sessions.createSession({ userId: "user-1", deviceId: "a", role: "user" });
  sessions.onAccountDisable("user-1");
  assert.equal(sessions.validateSession(first.sessionId).valid, false);
});

test("test_csrf_missing_header_denied", () => {
  const token = csrf.issueCsrfToken();
  const result = csrf.verifyCsrf({ cookieToken: token });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing_header");
});

test("test_csrf_wrong_token_denied", () => {
  const result = csrf.verifyCsrf({
    cookieToken: csrf.issueCsrfToken(),
    headerToken: csrf.issueCsrfToken(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "mismatch");
});

test("test_csrf_valid_token_allowed", () => {
  const token = csrf.issueCsrfToken();
  assert.equal(csrf.verifyCsrf({ cookieToken: token, headerToken: token }).ok, true);
});

test("test_cookie_secure_flag_set_in_production", () => {
  assert.equal(sessions.sessionCookieOptions(true).secure, true);
  assert.equal(sessions.sessionCookieOptions(false).secure, false);
});

test("test_cookie_httponly_flag_set", () => {
  assert.equal(sessions.sessionCookieOptions(true).httpOnly, true);
});

test("test_cookie_samesite_lax", () => {
  assert.equal(sessions.sessionCookieOptions(true).sameSite, "lax");
});

test("test_cors_blocks_untrusted_origin", () => {
  const headers = cors.corsHeaders("https://evil.example", ["http://localhost:3000"]);
  assert.deepEqual(headers, {});
});

test("test_cors_allows_trusted_origin", () => {
  const headers = cors.corsHeaders("http://localhost:3000", ["http://localhost:3000"]);
  assert.equal(headers["Access-Control-Allow-Origin"], "http://localhost:3000");
});
