const crypto = require("node:crypto");
const {
  test,
  assert,
  load,
  loadRoute,
  createSupabase,
  makeRequest,
  resetCookies,
  afterEach,
} = require("./harness.cjs");

const otp = load("lib/security/otp.ts");
const webauthn = load("lib/security/webauthn.ts");
const devices = load("lib/security/devices.ts");
const policy = load("lib/security/policy.ts");
const sessions = load("lib/security/sessions.ts");
const rateLimit = load("lib/auth-rate-limit.ts");

const RP_ID = "localhost";
const ORIGIN = "http://localhost:3000";

afterEach(() => {
  otp.resetOtp();
  webauthn.resetWebAuthn();
  sessions.resetSessions();
  rateLimit.resetAuthLimits();
  resetCookies();
});

function b64(value) {
  return Buffer.from(value).toString("base64url");
}

function clientData(type, challenge, origin) {
  return b64(JSON.stringify({ type, challenge, origin }));
}

function authenticatorData(rpId, signCount, credentialId, attested) {
  const rpHash = crypto.createHash("sha256").update(rpId).digest();
  const id = credentialId ? Buffer.from(credentialId, "base64url") : Buffer.alloc(0);
  const length = 37 + (attested ? 16 + 2 + id.length : 0);
  const buffer = Buffer.alloc(length);
  rpHash.copy(buffer, 0);
  buffer[32] = 0x01 | (attested ? 0x40 : 0);
  buffer.writeUInt32BE(signCount, 33);
  if (attested) {
    buffer.writeUInt16BE(id.length, 37 + 16);
    id.copy(buffer, 37 + 16 + 2);
  }
  return b64(buffer);
}

function keyPair() {
  const pair = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  return { privateKey: pair.privateKey, jwk: pair.publicKey.export({ format: "jwk" }) };
}

function signAssertion(privateKey, authDataB64, clientDataB64) {
  const clientHash = crypto.createHash("sha256").update(Buffer.from(clientDataB64, "base64url")).digest();
  const signed = Buffer.concat([Buffer.from(authDataB64, "base64url"), clientHash]);
  return crypto.sign("sha256", signed, privateKey).toString("base64url");
}

function registerCredential(userId, signCount = 0) {
  const options = webauthn.issueRegistrationOptions({
    userId,
    email: `${userId}@example.com`,
    rpId: RP_ID,
    origin: ORIGIN,
  });
  const pair = keyPair();
  const credentialId = b64(crypto.randomBytes(16));
  webauthn.verifyRegistration({
    response: {
      clientDataJSON: clientData("webauthn.create", options.challenge, ORIGIN),
      authenticatorData: authenticatorData(RP_ID, signCount, credentialId, true),
      credentialId,
      publicKeyJwk: pair.jwk,
      userId,
    },
    expectedChallenge: options.challenge,
    expectedOrigin: ORIGIN,
    rpId: RP_ID,
  });
  return { credentialId, pair };
}

test("test_webauthn_register_options_returns_challenge", () => {
  const options = webauthn.issueRegistrationOptions({
    userId: "user-1",
    email: "student@example.com",
    rpId: RP_ID,
    origin: ORIGIN,
  });
  assert.ok(options.challenge.length >= 32);
  assert.equal(options.rp.id, RP_ID);
  assert.equal(options.pubKeyCredParams[0].alg, -7);
  assert.equal(options.user.id, "user-1");
});

test("test_webauthn_register_verify_success", () => {
  const { credentialId } = registerCredential("user-1");
  assert.equal(webauthn.credentialsForUser("user-1").length, 1);
  assert.equal(webauthn.credentialsForUser("user-1")[0].id, credentialId);
});

test("test_webauthn_register_verify_invalid_origin", () => {
  const options = webauthn.issueRegistrationOptions({
    userId: "user-1",
    email: "student@example.com",
    rpId: RP_ID,
    origin: ORIGIN,
  });
  const pair = keyPair();
  const credentialId = b64(crypto.randomBytes(16));
  assert.throws(
    () =>
      webauthn.verifyRegistration({
        response: {
          clientDataJSON: clientData("webauthn.create", options.challenge, "https://evil.example"),
          authenticatorData: authenticatorData(RP_ID, 0, credentialId, true),
          credentialId,
          publicKeyJwk: pair.jwk,
          userId: "user-1",
        },
        expectedChallenge: options.challenge,
        expectedOrigin: ORIGIN,
        rpId: RP_ID,
      }),
    /Origin not allowed/
  );
});

test("test_webauthn_register_verify_replay_attack_denied", () => {
  const { credentialId, pair } = registerCredential("user-1");
  const options = webauthn.issueRegistrationOptions({
    userId: "user-1",
    email: "student@example.com",
    rpId: RP_ID,
    origin: ORIGIN,
  });
  assert.throws(
    () =>
      webauthn.verifyRegistration({
        response: {
          clientDataJSON: clientData("webauthn.create", options.challenge, ORIGIN),
          authenticatorData: authenticatorData(RP_ID, 0, credentialId, true),
          credentialId,
          publicKeyJwk: pair.jwk,
          userId: "user-1",
        },
        expectedChallenge: options.challenge,
        expectedOrigin: ORIGIN,
        rpId: RP_ID,
      }),
    /already registered/
  );
});

test("test_webauthn_login_options_requires_credentials", () => {
  assert.throws(
    () => webauthn.issueLoginOptions({ userId: "nobody", rpId: RP_ID }),
    /No WebAuthn credentials/
  );
});

test("test_webauthn_login_verify_success", () => {
  const { credentialId, pair } = registerCredential("user-1");
  const options = webauthn.issueLoginOptions({ userId: "user-1", rpId: RP_ID });
  const client = clientData("webauthn.get", options.challenge, ORIGIN);
  const auth = authenticatorData(RP_ID, 1, null, false);
  const result = webauthn.verifyLogin({
    response: {
      clientDataJSON: client,
      authenticatorData: auth,
      credentialId,
      signature: signAssertion(pair.privateKey, auth, client),
    },
    expectedChallenge: options.challenge,
    expectedOrigin: ORIGIN,
    rpId: RP_ID,
  });
  assert.equal(result.userId, "user-1");
  assert.equal(result.signCount, 1);
});

test("test_webauthn_login_verify_cloned_authenticator_detected", () => {
  const { credentialId, pair } = registerCredential("user-1");
  const options = webauthn.issueLoginOptions({ userId: "user-1", rpId: RP_ID });
  const client = clientData("webauthn.get", options.challenge, ORIGIN);
  const auth = authenticatorData(RP_ID, 0, null, false);
  assert.throws(
    () =>
      webauthn.verifyLogin({
        response: {
          clientDataJSON: client,
          authenticatorData: auth,
          credentialId,
          signature: signAssertion(pair.privateKey, auth, client),
        },
        expectedChallenge: options.challenge,
        expectedOrigin: ORIGIN,
        rpId: RP_ID,
      }),
    /cloned authenticator/
  );
});

test("test_webauthn_login_verify_wrong_signature", () => {
  const { credentialId } = registerCredential("user-1");
  const wrong = keyPair();
  const options = webauthn.issueLoginOptions({ userId: "user-1", rpId: RP_ID });
  const client = clientData("webauthn.get", options.challenge, ORIGIN);
  const auth = authenticatorData(RP_ID, 1, null, false);
  assert.throws(
    () =>
      webauthn.verifyLogin({
        response: {
          clientDataJSON: client,
          authenticatorData: auth,
          credentialId,
          signature: signAssertion(wrong.privateKey, auth, client),
        },
        expectedChallenge: options.challenge,
        expectedOrigin: ORIGIN,
        rpId: RP_ID,
      }),
    /Invalid signature/
  );
});

function loginRequest(overrides, body) {
  const supabase = createSupabase(overrides);
  const route = loadRoute("app/api/auth/login/route.ts", supabase);
  return {
    supabase,
    request: makeRequest("http://localhost:3000/api/auth/login", body, { host: "localhost:3000" }),
    route,
  };
}

test("test_password_login_success_with_valid_credentials", async () => {
  const { route, request, supabase } = loginRequest({}, {
    email: "student@example.com",
    password: "Password123",
  });
  const response = await route.POST(request);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.otp_sent, true);
  assert.ok(supabase.calls.some((call) => call.method === "signInWithOtp"));
});

test("test_password_login_fails_with_wrong_password", async () => {
  const { route, request } = loginRequest(
    {
      signInWithPassword: {
        data: { user: null },
        error: { message: "Invalid login credentials" },
      },
    },
    { email: "student@example.com", password: "wrong-password" }
  );
  const response = await route.POST(request);
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.error, "Invalid email or password");
});

test("test_password_login_fails_for_unverified_email", async () => {
  const { route, request } = loginRequest(
    {
      signInWithPassword: {
        data: { user: null },
        error: { message: "Email not confirmed" },
      },
    },
    { email: "student@example.com", password: "Password123" }
  );
  const response = await route.POST(request);
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.match(body.error, /Confirm your email/);
});

test("test_login_bruteforce_lockout_after_5_attempts", () => {
  const key = "login:1.2.3.4:student@example.com";
  for (let i = 0; i < 5; i += 1) {
    assert.equal(rateLimit.consumeAttempt(key).allowed, true);
  }
  assert.equal(rateLimit.consumeAttempt(key).allowed, false);
});

test("test_login_rate_limit_per_ip", () => {
  for (let i = 0; i < 5; i += 1) rateLimit.consumeAttempt("login:1.1.1.1:a@example.com");
  assert.equal(rateLimit.consumeAttempt("login:1.1.1.1:a@example.com").allowed, false);
  assert.equal(rateLimit.consumeAttempt("login:2.2.2.2:a@example.com").allowed, true);
});

test("test_otp_generation_and_email_delivery", () => {
  let delivered = null;
  const issued = otp.issueOtp({
    purpose: "login",
    identifier: "student@example.com",
    send: (message) => {
      delivered = message;
    },
  });
  assert.match(issued.code, /^[0-9]{6}$/);
  assert.equal(delivered.code, issued.code);
  assert.equal(delivered.to, "student@example.com");
  assert.equal(delivered.purpose, "login");
});

test("test_otp_expiry_after_ttl", () => {
  const issued = otp.issueOtp({
    purpose: "login",
    identifier: "student@example.com",
    ttlMs: 1000,
    now: 1000,
  });
  const result = otp.verifyOtp({
    purpose: "login",
    identifier: "student@example.com",
    code: issued.code,
    now: 2500,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "expired");
});

test("test_otp_max_attempts_exceeded", () => {
  const issued = otp.issueOtp({ purpose: "login", identifier: "student@example.com" });
  for (let i = 0; i < 5; i += 1) {
    otp.verifyOtp({
      purpose: "login",
      identifier: "student@example.com",
      code: "000000",
    });
  }
  const result = otp.verifyOtp({
    purpose: "login",
    identifier: "student@example.com",
    code: issued.code,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "too_many");
});

test("test_otp_replay_attack_denied", () => {
  const issued = otp.issueOtp({ purpose: "login", identifier: "student@example.com" });
  assert.equal(
    otp.verifyOtp({ purpose: "login", identifier: "student@example.com", code: issued.code }).ok,
    true
  );
  const replay = otp.verifyOtp({
    purpose: "login",
    identifier: "student@example.com",
    code: issued.code,
  });
  assert.equal(replay.ok, false);
  assert.equal(replay.reason, "used");
});

test("test_public_citizen_otp_flow", () => {
  otp.registerAccount("citizen@example.com", "citizen");
  const issued = otp.issueOtp({ purpose: "public", identifier: "citizen@example.com" });
  const result = otp.verifyOtp({
    purpose: "public",
    identifier: "citizen@example.com",
    code: issued.code,
  });
  assert.equal(result.ok, true);
});

test("test_public_otp_cannot_hijack_staff_account", () => {
  otp.registerAccount("staff@example.com", "staff");
  assert.throws(
    () => otp.issueOtp({ purpose: "public", identifier: "staff@example.com" }),
    /cannot be issued for staff accounts/
  );
  const outsider = otp.issueOtp({ purpose: "public", identifier: "citizen@example.com" });
  const hijack = otp.verifyOtp({
    purpose: "public",
    identifier: "staff@example.com",
    code: outsider.code,
  });
  assert.equal(hijack.ok, false);
});

test("test_password_reset_generates_single_use_link", () => {
  const issued = otp.issueOtp({ purpose: "reset", identifier: "student@example.com" });
  assert.equal(
    otp.verifyOtp({ purpose: "reset", identifier: "student@example.com", code: issued.code }).ok,
    true
  );
  assert.equal(
    otp.verifyOtp({ purpose: "reset", identifier: "student@example.com", code: issued.code }).reason,
    "used"
  );
});

test("test_password_reset_invalidates_old_sessions", () => {
  const first = sessions.createSession({ userId: "user-1", deviceId: "device-a", role: "user" });
  const second = sessions.createSession({ userId: "user-1", deviceId: "device-b", role: "user" });
  sessions.onPasswordChange("user-1");
  assert.equal(sessions.validateSession(first.sessionId).valid, false);
  assert.equal(sessions.validateSession(second.sessionId).valid, false);
});

test("test_password_change_requires_current_password", () => {
  assert.equal(
    policy.passwordChangeAllowed({ currentPassword: "OldPass1", storedPassword: "OldPass1" }),
    true
  );
  assert.throws(
    () => policy.passwordChangeAllowed({ currentPassword: "WrongPass1", storedPassword: "OldPass1" }),
    /Current password is incorrect/
  );
});

test("test_mfa_required_for_admin_login", () => {
  assert.equal(policy.mfaRequired("admin"), true);
  assert.equal(policy.mfaRequired("user"), false);
  assert.throws(() => policy.assertMfaSatisfied("admin", false), /MFA verification required/);
});

test("test_mfa_bypass_denied_without_valid_otp", () => {
  assert.throws(() => policy.assertMfaSatisfied("admin", false), /MFA/);
  assert.doesNotThrow(() => policy.assertMfaSatisfied("admin", true));
  assert.doesNotThrow(() => policy.assertMfaSatisfied("user", false));
});

test("test_device_fingerprint_generated_on_login", () => {
  const fingerprint = devices.deviceFingerprint({
    userAgent: "Mozilla/5.0",
    acceptLanguage: "en-GB",
    platform: "Win32",
  });
  assert.match(fingerprint, /^[0-9a-f]{64}$/);
  const session = sessions.createSession({ userId: "user-1", deviceId: fingerprint, role: "user" });
  assert.equal(sessions.getSession(session.sessionId).deviceId, fingerprint);
});
