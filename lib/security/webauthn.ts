import {
  createHash,
  createPublicKey,
  randomBytes,
  verify as verifySignature,
  type JsonWebKey,
} from "crypto";

export class WebAuthnError extends Error {}

export interface StoredCredential {
  id: string;
  userId: string;
  publicKeyJwk: JsonWebKey;
  signCount: number;
}

interface ChallengeEntry {
  challenge: string;
  purpose: "register" | "login";
  userId?: string;
  expiresAt: number;
  used: boolean;
}

const challenges = new Map<string, ChallengeEntry>();
const credentials = new Map<string, StoredCredential>();

export function resetWebAuthn(): void {
  challenges.clear();
  credentials.clear();
}

function issueChallenge(purpose: "register" | "login", userId: string | undefined, now: number, ttlMs: number): string {
  const challenge = randomBytes(32).toString("base64url");
  challenges.set(challenge, { challenge, purpose, userId, expiresAt: now + ttlMs, used: false });
  return challenge;
}

function consumeChallenge(challenge: string, purpose: "register" | "login", now: number): void {
  const entry = challenges.get(challenge);
  if (!entry || entry.used || entry.expiresAt <= now || entry.purpose !== purpose) {
    throw new WebAuthnError("Challenge is invalid or expired");
  }
  entry.used = true;
}

export function credentialsForUser(userId: string): StoredCredential[] {
  const list: StoredCredential[] = [];
  credentials.forEach((credential) => {
    if (credential.userId === userId) list.push(credential);
  });
  return list;
}

export function issueRegistrationOptions(input: {
  userId: string;
  email: string;
  rpId: string;
  origin: string;
  now?: number;
  ttlMs?: number;
}): {
  challenge: string;
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: Array<{ type: string; alg: number }>;
  timeout: number;
  attestation: string;
  excludeCredentials: Array<{ type: string; id: string }>;
} {
  const now = input.now ?? Date.now();
  const challenge = issueChallenge("register", input.userId, now, input.ttlMs ?? 5 * 60_000);
  return {
    challenge,
    rp: { id: input.rpId, name: "NursePrep" },
    user: { id: input.userId, name: input.email, displayName: input.email },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    timeout: 60_000,
    attestation: "none",
    excludeCredentials: credentialsForUser(input.userId).map((credential) => ({
      type: "public-key",
      id: credential.id,
    })),
  };
}

export function issueLoginOptions(input: {
  userId: string;
  rpId: string;
  now?: number;
  ttlMs?: number;
}): {
  challenge: string;
  rpId: string;
  timeout: number;
  allowCredentials: Array<{ type: string; id: string }>;
} {
  const registered = credentialsForUser(input.userId);
  if (registered.length === 0) {
    throw new WebAuthnError("No WebAuthn credentials registered for this account");
  }
  const now = input.now ?? Date.now();
  return {
    challenge: issueChallenge("login", input.userId, now, input.ttlMs ?? 5 * 60_000),
    rpId: input.rpId,
    timeout: 60_000,
    allowCredentials: registered.map((credential) => ({ type: "public-key", id: credential.id })),
  };
}

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function parseClientData(input: {
  clientDataJSON: string;
  expectedType: string;
  expectedChallenge: string;
  expectedOrigin: string;
}): Buffer {
  const raw = decodeBase64Url(input.clientDataJSON);
  let clientData: { type?: unknown; challenge?: unknown; origin?: unknown };
  try {
    clientData = JSON.parse(raw.toString("utf8")) as typeof clientData;
  } catch {
    throw new WebAuthnError("Invalid client data");
  }
  if (clientData.type !== input.expectedType) throw new WebAuthnError("Unexpected ceremony type");
  if (clientData.challenge !== input.expectedChallenge) throw new WebAuthnError("Challenge mismatch");
  if (clientData.origin !== input.expectedOrigin) throw new WebAuthnError("Origin not allowed");
  return raw;
}

function readAuthenticatorData(input: {
  authenticatorData: string;
  rpId: string;
  requireAttestedCredential: boolean;
}): { raw: Buffer; signCount: number } {
  const raw = decodeBase64Url(input.authenticatorData);
  if (raw.length < 37) throw new WebAuthnError("Malformed authenticator data");
  const expectedRpIdHash = createHash("sha256").update(input.rpId).digest();
  if (!raw.subarray(0, 32).equals(expectedRpIdHash)) throw new WebAuthnError("Relying party mismatch");
  const flags = raw[32];
  if ((flags & 0x01) === 0) throw new WebAuthnError("User presence was not asserted");
  if (input.requireAttestedCredential && (flags & 0x40) === 0) {
    throw new WebAuthnError("Attested credential data missing");
  }
  return { raw, signCount: raw.readUInt32BE(33) };
}

export function verifyRegistration(input: {
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    credentialId: string;
    publicKeyJwk?: JsonWebKey;
    userId: string;
  };
  expectedChallenge: string;
  expectedOrigin: string;
  rpId: string;
  now?: number;
}): { credentialId: string; signCount: number } {
  consumeChallenge(input.expectedChallenge, "register", input.now ?? Date.now());
  parseClientData({
    clientDataJSON: input.response.clientDataJSON,
    expectedType: "webauthn.create",
    expectedChallenge: input.expectedChallenge,
    expectedOrigin: input.expectedOrigin,
  });
  const { signCount } = readAuthenticatorData({
    authenticatorData: input.response.authenticatorData,
    rpId: input.rpId,
    requireAttestedCredential: true,
  });
  if (!input.response.publicKeyJwk) throw new WebAuthnError("Public key missing");
  if (credentials.has(input.response.credentialId)) {
    throw new WebAuthnError("Credential is already registered");
  }
  credentials.set(input.response.credentialId, {
    id: input.response.credentialId,
    userId: input.response.userId,
    publicKeyJwk: input.response.publicKeyJwk,
    signCount,
  });
  return { credentialId: input.response.credentialId, signCount };
}

export function verifyLogin(input: {
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    credentialId: string;
    signature: string;
  };
  expectedChallenge: string;
  expectedOrigin: string;
  rpId: string;
  now?: number;
}): { userId: string; signCount: number } {
  consumeChallenge(input.expectedChallenge, "login", input.now ?? Date.now());
  if (input.response.credentialId) {
    parseClientData({
      clientDataJSON: input.response.clientDataJSON,
      expectedType: "webauthn.get",
      expectedChallenge: input.expectedChallenge,
      expectedOrigin: input.expectedOrigin,
    });
  }
  const { raw, signCount } = readAuthenticatorData({
    authenticatorData: input.response.authenticatorData,
    rpId: input.rpId,
    requireAttestedCredential: false,
  });
  const credential = credentials.get(input.response.credentialId);
  if (!credential) throw new WebAuthnError("Unknown credential");
  if (signCount <= credential.signCount) {
    throw new WebAuthnError("Possible cloned authenticator");
  }
  const clientDataHash = createHash("sha256")
    .update(decodeBase64Url(input.response.clientDataJSON))
    .digest();
  const signedData = Buffer.concat([raw, clientDataHash]);
  const keyObject = createPublicKey({ key: credential.publicKeyJwk, format: "jwk" });
  const valid = verifySignature(
    "sha256",
    signedData,
    keyObject,
    decodeBase64Url(input.response.signature)
  );
  if (!valid) throw new WebAuthnError("Invalid signature");
  credential.signCount = signCount;
  return { userId: credential.userId, signCount };
}
