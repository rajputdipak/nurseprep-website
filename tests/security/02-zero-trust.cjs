const { test, assert, load } = require("./harness.cjs");

const tokens = load("lib/security/tokens.ts");
const zeroTrust = load("lib/security/zero-trust.ts");
const risk = load("lib/security/risk.ts");
const devices = load("lib/security/devices.ts");

const SECRET = "test-zero-trust-secret";
const CLAIMS = { sub: "user-1", sid: "session-1", did: "device-a", role: "user" };

test("test_zero_trust_blocks_missing_jwt", () => {
  const result = zeroTrust.zeroTrustGuard({ path: "/dashboard", secret: SECRET });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(result.reason, "missing");
});

test("test_zero_trust_blocks_invalid_jwt", () => {
  const result = zeroTrust.zeroTrustGuard({
    path: "/dashboard",
    token: "not.a.real-token",
    secret: SECRET,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid");
});

test("test_zero_trust_blocks_expired_jwt", () => {
  const token = tokens.signJwt(CLAIMS, SECRET, -60);
  const result = zeroTrust.zeroTrustGuard({ path: "/dashboard", token, secret: SECRET });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "expired");
});

test("test_zero_trust_device_binding_mismatch", () => {
  const token = tokens.signJwt(CLAIMS, SECRET);
  const result = zeroTrust.zeroTrustGuard({
    path: "/dashboard",
    token,
    secret: SECRET,
    deviceId: "device-b",
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "device_mismatch");
});

test("test_zero_trust_allows_public_ui_paths", () => {
  const paths = ["/", "/login", "/register", "/forgot-password", "/tenders", "/jobs"];
  paths.forEach((path) => {
    const result = zeroTrust.zeroTrustGuard({ path, secret: SECRET });
    assert.equal(result.ok, true, `expected ${path} to be public`);
  });
});

test("test_zero_trust_allows_static_assets", () => {
  const paths = ["/_next/static/chunks/main.js", "/favicon.ico", "/images/logo.png"];
  paths.forEach((path) => {
    const result = zeroTrust.zeroTrustGuard({ path, secret: SECRET });
    assert.equal(result.ok, true, `expected ${path} to be static`);
  });
});

test("test_zero_trust_blocks_critical_risk_score", () => {
  const token = tokens.signJwt(CLAIMS, SECRET);
  const result = zeroTrust.zeroTrustGuard({
    path: "/admin",
    token,
    secret: SECRET,
    riskScore: 95,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.reason, "critical_risk");
});

test("test_risk_engine_new_device_score", () => {
  assert.equal(risk.scoreRisk({ newDevice: true }), risk.RISK_WEIGHTS.newDevice);
});

test("test_risk_engine_new_country_score", () => {
  assert.equal(risk.scoreRisk({ newCountry: true }), risk.RISK_WEIGHTS.newCountry);
});

test("test_risk_engine_impossible_travel_detected", () => {
  const delhi = { lat: 28.6139, lon: 77.209 };
  const london = { lat: 51.5074, lon: -0.1278 };
  const detected = risk.detectImpossibleTravel(
    { point: delhi, at: 0 },
    { point: london, at: 60 * 60 * 1000 }
  );
  assert.equal(detected, true);
});

test("test_risk_engine_tor_vpn_detected", () => {
  assert.equal(
    risk.scoreRisk({ torOrVpn: true }),
    risk.RISK_WEIGHTS.torOrVpn
  );
});

test("test_risk_engine_unusual_hour_score", () => {
  assert.equal(
    risk.scoreRisk({ unusualHour: true }),
    risk.RISK_WEIGHTS.unusualHour
  );
});

test("test_risk_engine_recent_failures_score", () => {
  assert.equal(
    risk.scoreRisk({ recentFailures: 3 }),
    risk.RISK_WEIGHTS.recentFailures
  );
  assert.equal(risk.scoreRisk({ recentFailures: 1 }), 0);
});

test("test_risk_engine_sensitive_action_score", () => {
  assert.equal(
    risk.scoreRisk({ sensitiveAction: true }),
    risk.RISK_WEIGHTS.sensitiveAction
  );
});

test("test_risk_engine_new_ip_score", () => {
  assert.equal(risk.scoreRisk({ newIp: true }), risk.RISK_WEIGHTS.newIp);
});

test("test_risk_middleware_blocks_at_80", () => {
  assert.equal(risk.decideRisk(80), "block");
  assert.equal(risk.decideRisk(79), "step_up");
});

test("test_risk_middleware_quarantines_at_90", () => {
  assert.equal(risk.decideRisk(90), "quarantine");
  assert.equal(risk.decideRisk(100), "quarantine");
});

test("test_risk_middleware_step_up_at_60", () => {
  assert.equal(risk.decideRisk(60), "step_up");
  assert.equal(risk.decideRisk(59), "allow");
});

test("test_burst_detection_triggers_anomaly", () => {
  const now = 1_000_000;
  const burst = [];
  for (let i = 0; i < 12; i += 1) burst.push(now - i * 1000);
  assert.equal(risk.detectBurst(burst, now, 60_000, 10), true);
  assert.equal(risk.detectBurst([now - 600_000], now, 60_000, 10), false);
});

test("test_impossible_travel_haversine_distance_calculation", () => {
  const delhi = { lat: 28.6139, lon: 77.209 };
  const london = { lat: 51.5074, lon: -0.1278 };
  const distance = risk.haversineKm(delhi, london);
  assert.ok(distance > 6000 && distance < 7500, `unexpected distance ${distance}`);
});

test("test_ueba_baseline_ema_update", () => {
  assert.equal(devices.updateEma(10, 20, 0.2), 12);
  assert.equal(devices.updateEma(12, 12, 0.2), 12);
});

test("test_ueba_typical_countries_tracking", () => {
  const baseline = devices.newBaseline();
  devices.trackCountry(baseline, "IN");
  devices.trackCountry(baseline, "US");
  assert.deepEqual(baseline.countries, ["IN", "US"]);
  assert.equal(devices.isNewCountry(baseline, "IN"), false);
  assert.equal(devices.isNewCountry(baseline, "GB"), true);
});

test("test_ueba_trusted_devices_tracking", () => {
  const baseline = devices.newBaseline();
  assert.equal(devices.isNewDevice(baseline, "device-a"), true);
  devices.trackDevice(baseline, "device-a");
  assert.equal(devices.isNewDevice(baseline, "device-a"), false);
  assert.deepEqual(baseline.trustedDevices, ["device-a"]);
});

test("test_risk_score_allows_normal_request", () => {
  const score = risk.scoreRisk({ newIp: true });
  assert.equal(risk.decideRisk(score), "allow");
  const token = tokens.signJwt(CLAIMS, SECRET);
  const result = zeroTrust.zeroTrustGuard({
    path: "/dashboard",
    token,
    secret: SECRET,
    riskScore: score,
  });
  assert.equal(result.ok, true);
});

test("test_risk_score_headers_present_in_response", () => {
  const headers = risk.riskHeaders(75);
  assert.equal(headers["x-risk-score"], "75");
  assert.equal(headers["x-risk-decision"], "step_up");
  assert.ok("x-risk-score" in headers);
});
