import { createAdminClient } from "@/lib/supabase/admin";
import { isEmailConfigured, normalizeRecipients, sendEmail } from "@/lib/email";
import {
  buildAdminPaymentEmail, buildStudentPaymentEmail,
  type PaymentAccessWindow, type PaymentEmailPayment, type PaymentEmailStudent,
} from "@/lib/payment-emails";

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
}

async function adminRecipients(): Promise<string[]> {
  const override = normalizeRecipients((process.env.ADMIN_NOTIFICATION_EMAIL ?? "").split(/[,;\s]+/));
  if (override.length > 0) return override;
  const admin = createAdminClient();
  if (!admin) return [];
  const { data, error } = await admin.from("profiles").select("email").eq("role", "admin");
  if (error) {
    console.warn("[email] admin recipient lookup failed:", error.code ?? "unknown");
    return [];
  }
  return normalizeRecipients((data ?? []).map((row: { email: string | null }) => row.email));
}

export async function notifyAdminsOfPaymentSubmitted(
  payment: PaymentEmailPayment,
  student: PaymentEmailStudent
): Promise<void> {
  if (!isEmailConfigured()) return;
  const recipients = await adminRecipients();
  const mail = buildAdminPaymentEmail(payment, student, siteUrl());
  await sendEmail({ to: recipients, ...mail });
}

export async function notifyStudentOfPaymentReview(
  payment: PaymentEmailPayment,
  student: PaymentEmailStudent,
  decision: "verified" | "rejected",
  access: PaymentAccessWindow | null
): Promise<void> {
  if (!isEmailConfigured()) return;
  const mail = buildStudentPaymentEmail(payment, student, decision, access, siteUrl());
  await sendEmail({ to: [student.email], ...mail });
}
