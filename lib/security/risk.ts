export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface RiskInput {
  newDevice?: boolean;
  newCountry?: boolean;
  newIp?: boolean;
  impossibleTravel?: boolean;
  torOrVpn?: boolean;
  unusualHour?: boolean;
  recentFailures?: number;
  sensitiveAction?: boolean;
}

export const RISK_WEIGHTS = {
  newDevice: 25,
  newCountry: 30,
  newIp: 10,
  impossibleTravel: 40,
  torOrVpn: 35,
  unusualHour: 10,
  recentFailures: 15,
  sensitiveAction: 20,
} as const;

export const RISK_THRESHOLDS = {
  stepUp: 60,
  block: 80,
  quarantine: 90,
} as const;

export type RiskDecision = "allow" | "step_up" | "block" | "quarantine";

export function scoreRisk(input: RiskInput): number {
  let score = 0;
  if (input.newDevice) score += RISK_WEIGHTS.newDevice;
  if (input.newCountry) score += RISK_WEIGHTS.newCountry;
  if (input.newIp) score += RISK_WEIGHTS.newIp;
  if (input.impossibleTravel) score += RISK_WEIGHTS.impossibleTravel;
  if (input.torOrVpn) score += RISK_WEIGHTS.torOrVpn;
  if (input.unusualHour) score += RISK_WEIGHTS.unusualHour;
  if ((input.recentFailures ?? 0) >= 3) score += RISK_WEIGHTS.recentFailures;
  if (input.sensitiveAction) score += RISK_WEIGHTS.sensitiveAction;
  return Math.min(100, score);
}

export function decideRisk(score: number): RiskDecision {
  if (score >= RISK_THRESHOLDS.quarantine) return "quarantine";
  if (score >= RISK_THRESHOLDS.block) return "block";
  if (score >= RISK_THRESHOLDS.stepUp) return "step_up";
  return "allow";
}

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const radius = 6371;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function detectImpossibleTravel(
  previous: { point: GeoPoint; at: number },
  next: { point: GeoPoint; at: number },
  maxKmPerHour = 900
): boolean {
  const hours = Math.max((next.at - previous.at) / 3_600_000, 1 / 3600);
  const distance = haversineKm(previous.point, next.point);
  if (distance < 500) return false;
  return distance / hours > maxKmPerHour;
}

export function detectBurst(
  timestamps: number[],
  now: number,
  windowMs = 60_000,
  threshold = 10
): boolean {
  const recent = timestamps.filter((at) => now - at <= windowMs);
  return recent.length >= threshold;
}

export function riskHeaders(score: number): Record<string, string> {
  const normalized = Math.max(0, Math.min(100, Math.round(score)));
  return {
    "x-risk-score": String(normalized),
    "x-risk-decision": decideRisk(normalized),
  };
}
