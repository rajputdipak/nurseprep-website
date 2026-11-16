import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const UPI_PATTERN = /^[A-Za-z0-9._-]{2,100}@[A-Za-z0-9]{2,64}$/;
export const DATABASE_UPDATE_REQUIRED = "Database update required: run upgrade-platform.sql";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PaymentApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function requireUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new PaymentApiError(400, "Invalid id");
  }
  return value;
}

export function requireText(value: unknown, name: string, max: number, allowEmpty = false): string {
  if (typeof value !== "string" || value.length > max || (!allowEmpty && !value.trim())) {
    throw new PaymentApiError(400, `Invalid ${name}`);
  }
  return value.trim();
}

// Bound the bytes actually consumed, rather than trusting Content-Length.
export async function readPaymentBody(request: Request, allowedKeys: string[]): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new PaymentApiError(400, "JSON body required");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new PaymentApiError(413, "Request body too large");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)
      || Object.keys(body).some(key => !allowedKeys.includes(key))) {
      throw new PaymentApiError(400, "Invalid request fields");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof PaymentApiError) throw error;
    throw new PaymentApiError(400, "Invalid JSON body");
  } finally {
    reader.releaseLock();
  }
}

// Never send SQL details, hints, stack traces, or arbitrary database messages to clients.
export function checkPaymentDatabase(error: { code?: string; message?: string } | null): void {
  if (!error) return;
  if (["42P01", "42703", "42883", "3F000", "PGRST200", "PGRST202", "PGRST204", "PGRST205"].includes(error.code ?? "")) {
    throw new PaymentApiError(503, DATABASE_UPDATE_REQUIRED);
  }
  const known: Record<string, [number, string]> = {
    NOT_AUTHENTICATED: [401, "Please sign in"],
    ADMIN_REQUIRED: [403, "Admin access required"],
    PROFILE_NOT_FOUND: [409, "Your profile is not available"],
    PLAN_NOT_FOUND: [404, "Plan not found or inactive"],
    INVALID_PAID_PLAN: [400, "Select a valid paid plan"],
    PAYMENTS_UNAVAILABLE: [503, "UPI payments are currently unavailable"],
    PAYMENT_NOT_FOUND: [404, "Payment not found"],
    INVALID_UTR: [400, "UTR must contain exactly 12 digits"],
    PAYMENT_NOT_PENDING: [409, "This payment has already been reviewed"],
    UTR_ALREADY_SUBMITTED: [409, "A submitted UTR cannot be replaced"],
    UTR_ALREADY_USED: [409, "This UTR has already been used"],
    UTR_REQUIRED: [409, "A submitted UTR is required before review"],
    INVALID_DECISION: [400, "Invalid review decision"],
    INVALID_NOTE: [400, "Note must be at most 500 characters"],
    REVIEW_CONFLICT: [409, "This payment has a different final decision"],
    PAYMENT_SNAPSHOT_MISSING: [409, "Legacy payment has no complete checkout snapshot; do not approve it as a new checkout"],
  };
  const safe = known[error.message ?? ""];
  if (safe) throw new PaymentApiError(...safe);
  if (error.code === "23505") throw new PaymentApiError(409, "Payment conflicts with an existing record");
  if (error.code === "42501") throw new PaymentApiError(403, "Operation not permitted");
  if (error.code === "23514") throw new PaymentApiError(400, "Invalid payment settings or plan values");
  throw new PaymentApiError(500, "Payment operation failed. Please try again.");
}

export async function requirePaymentUser(admin = false) {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new PaymentApiError(401, "Please sign in");
  if (admin) {
    const { data: profile, error: profileError } = await supabase.from("profiles")
      .select("role").eq("id", user.id).maybeSingle();
    checkPaymentDatabase(profileError);
    if (profile?.role !== "admin") throw new PaymentApiError(403, "Admin access required");
  }
  return { supabase, user };
}

// Settings/plans exist independently of payment RPCs: fail safely if the upgrade is absent.
export async function requirePaymentPlatform(supabase: ReturnType<typeof createClient>) {
  const { error } = await supabase.rpc("has_test_access");
  checkPaymentDatabase(error);
}

export async function paymentRoute(action: () => Promise<unknown>) {
  try {
    return NextResponse.json(await action(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const safe = error instanceof PaymentApiError
      ? error : new PaymentApiError(500, "Payment operation failed. Please try again.");
    return NextResponse.json({ error: safe.message }, {
      status: safe.status, headers: { "Cache-Control": "no-store" },
    });
  }
}
