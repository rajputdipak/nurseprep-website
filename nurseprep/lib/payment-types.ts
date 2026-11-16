export interface PaymentPlan {
  id: string;
  name: string;
  price: number;
  duration_days: number;
  features: string[];
  is_active: boolean;
}

export interface PaymentSettings {
  id: number;
  upi_id: string;
  payee_name: string;
  is_enabled: boolean;
}

export interface Payment {
  id: string;
  user_id: string;
  plan_id: string | null;
  amount: number;
  method: string;
  utr: string | null;
  status: "pending" | "verified" | "rejected";
  created_at: string;
  plan_name: string | null;
  duration_days: number | null;
  upi_id: string | null;
  payee_name: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  admin_note: string;
}

export interface AdminPayment extends Payment {
  student: { full_name: string; email: string } | null;
}

export interface PaymentAccess {
  id: string;
  plan_id: string;
  starts_at: string;
  ends_at: string;
  status: "active" | "expired" | "cancelled";
}

export interface PaymentCheckout {
  payment: Payment;
  upi_uri: string | null;
  qr_data_url: string | null;
}

// Explicit selection makes an unapplied payment migration a visible load error.
export const PAYMENT_COLUMNS = "id,user_id,plan_id,amount,method,utr,status,created_at,plan_name,duration_days,upi_id,payee_name,reviewed_at,reviewed_by,admin_note";
export const PLAN_COLUMNS = "id,name,price,duration_days,features,is_active";
export const SETTINGS_COLUMNS = "id,upi_id,payee_name,is_enabled";
export const ACCESS_COLUMNS = "id,plan_id,starts_at,ends_at,status";
export const PAYMENT_SETUP_MESSAGE = "Payment setup/database update required";

export function paymentLoadError(error: { code?: string; message?: string } | null): string | null {
  if (!error) return null;
  if (["42P01", "42703", "PGRST200", "PGRST204", "PGRST205"].includes(error.code ?? "") ||
      /schema cache|does not exist/i.test(error.message ?? "")) {
    return PAYMENT_SETUP_MESSAGE;
  }
  return "Payment data is temporarily unavailable. Refresh to try again.";
}

export function formatPaymentAmount(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value)
    : "Amount unavailable";
}

export function formatPaymentDate(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Date unavailable";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
  }) + " IST";
}

export function formatPaymentDuration(value: number | null | undefined): string {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? `${value} days`
    : "Duration unavailable";
}

export function hasPaymentSnapshot(payment: Payment): boolean {
  return Boolean(payment.plan_name?.trim() && payment.upi_id?.trim() && payment.payee_name?.trim()) &&
    Number.isFinite(payment.amount) && payment.amount > 0 &&
    typeof payment.duration_days === "number" && Number.isSafeInteger(payment.duration_days) && payment.duration_days > 0;
}

export function paymentStatusLabel(payment: Payment): string {
  if (payment.status === "verified") return "Verified";
  if (payment.status === "rejected") return "Rejected";
  return payment.utr ? "Submitted — pending admin verification" : "Pending — UTR not submitted";
}

export async function postPayment<T = unknown>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = typeof result?.error === "string" ? result.error : "Request failed. Please try again.";
    const setupRequired = response.status === 503 && /database|migration|schema|setup/i.test(detail);
    throw new Error(setupRequired ? `${PAYMENT_SETUP_MESSAGE}. ${detail}` : detail);
  }
  return result as T;
}
