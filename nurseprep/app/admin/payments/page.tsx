import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PaymentsManager } from "@/components/admin/payments-manager";
import { isEmailConfigured } from "@/lib/email";
import {
  PAYMENT_COLUMNS, PLAN_COLUMNS, SETTINGS_COLUMNS, paymentLoadError,
  type AdminPayment, type PaymentPlan, type PaymentSettings,
} from "@/lib/payment-types";

export const metadata: Metadata = { title: "Manage Payments" };

export default async function AdminPaymentsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  let settings: PaymentSettings | null = null;
  let plans: PaymentPlan[] = [];
  let payments: AdminPayment[] = [];
  let pendingCount: number | null = null;
  let settingsError: string | null = null;
  let plansError: string | null = null;
  let paymentsError: string | null = null;
  let countError: string | null = null;

  try {
    const [settingsResult, planResult, paymentResult, countResult] = await Promise.all([
      supabase.from("payment_settings").select(SETTINGS_COLUMNS).eq("id", 1).maybeSingle<PaymentSettings>(),
      supabase.from("plans").select(PLAN_COLUMNS).order("price").returns<PaymentPlan[]>(),
      supabase.from("payments").select(`${PAYMENT_COLUMNS},student:profiles!payments_user_id_fkey(full_name,email)`).order("created_at", { ascending: false }).limit(100).returns<AdminPayment[]>(),
      supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "pending").not("utr", "is", null),
    ]);
    settings = settingsResult.data;
    plans = planResult.data ?? [];
    payments = paymentResult.data ?? [];
    settingsError = paymentLoadError(settingsResult.error);
    plansError = paymentLoadError(planResult.error);
    paymentsError = paymentLoadError(paymentResult.error);
    countError = paymentLoadError(countResult.error);
    pendingCount = countResult.error || paymentResult.error ? null : countResult.count;
  } catch {
    const message = "Payment data is temporarily unavailable. Refresh to try again.";
    settingsError = plansError = paymentsError = countError = message;
  }

  return <PaymentsManager settings={settings} plans={plans} initialPayments={payments} pendingCount={pendingCount} settingsError={settingsError} plansError={plansError} paymentsError={paymentsError} countError={countError} emailReady={isEmailConfigured()} />;
}
