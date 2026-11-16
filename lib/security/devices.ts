import { createHash } from "crypto";

export interface FingerprintInput {
  userAgent?: string;
  acceptLanguage?: string;
  platform?: string;
}

export function deviceFingerprint(input: FingerprintInput): string {
  const material = [input.userAgent ?? "", input.acceptLanguage ?? "", input.platform ?? ""].join("|");
  return createHash("sha256").update(material).digest("hex");
}

export interface RiskBaseline {
  loginHourEma: number;
  countryCounts: Record<string, number>;
  countries: string[];
  trustedDevices: string[];
}

export function newBaseline(): RiskBaseline {
  return { loginHourEma: 12, countryCounts: {}, countries: [], trustedDevices: [] };
}

// Exponentially weighted moving average; a low alpha keeps a single odd login
// from rewriting what "normal" looks like for the account.
export function updateEma(previous: number, observed: number, alpha = 0.2): number {
  return Number((alpha * observed + (1 - alpha) * previous).toFixed(4));
}

export function trackCountry(baseline: RiskBaseline, country: string): RiskBaseline {
  baseline.countryCounts[country] = (baseline.countryCounts[country] ?? 0) + 1;
  if (!baseline.countries.includes(country)) baseline.countries.push(country);
  return baseline;
}

export function trackDevice(baseline: RiskBaseline, deviceId: string): RiskBaseline {
  if (!baseline.trustedDevices.includes(deviceId)) baseline.trustedDevices.push(deviceId);
  return baseline;
}

export function isNewDevice(baseline: RiskBaseline, deviceId: string): boolean {
  return !baseline.trustedDevices.includes(deviceId);
}

export function isNewCountry(baseline: RiskBaseline, country: string): boolean {
  return !baseline.countries.includes(country);
}
