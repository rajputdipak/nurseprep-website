import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import { PaymentPanel } from "@/components/payment-panel";
import {
  ACCESS_COLUMNS, PAYMENT_COLUMNS, PLAN_COLUMNS, SETTINGS_COLUMNS,
  PAYMENT_SETUP_MESSAGE, paymentLoadError,
  type Payment, type PaymentAccess, type PaymentPlan, type PaymentSettings,
} from "@/lib/payment-types";

export const metadata: Metadata = { title: "Payments & Plans" };

export default async function PaymentsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let plans: PaymentPlan[] = [];
  let settings: PaymentSettings | null = null;
  let payments: Payment[] = [];
  let access: PaymentAccess[] = [];
  let plansError: string | null = null;
  let settingsError: string | null = null;
  let paymentsError: string | null = null;
  let accessError: string | null = null;

  try {
    const [planResult, settingsResult, paymentResult, accessResult] = await Promise.all([
      supabase.from("plans").select(PLAN_COLUMNS).eq("is_active", true).gt("price", 0).order("price").returns<PaymentPlan[]>(),
      supabase.from("payment_settings").select(SETTINGS_COLUMNS).eq("id", 1).maybeSingle<PaymentSettings>(),
      supabase.from("payments").select(PAYMENT_COLUMNS).eq("user_id", user.id).order("created_at", { ascending: false }).limit(50).returns<Payment[]>(),
      supabase.from("user_plans").select(ACCESS_COLUMNS).eq("user_id", user.id).eq("status", "active").gt("ends_at", new Date().toISOString()).order("starts_at").returns<PaymentAccess[]>(),
    ]);
    plans = planResult.data ?? [];
    settings = settingsResult.data;
    payments = paymentResult.data ?? [];
    access = accessResult.data ?? [];
    plansError = paymentLoadError(planResult.error);
    settingsError = paymentLoadError(settingsResult.error) ?? (!settings ? PAYMENT_SETUP_MESSAGE : null);
    paymentsError = paymentLoadError(paymentResult.error);
    accessError = paymentLoadError(accessResult.error);
  } catch {
    const message = "Payment data is temporarily unavailable. Refresh to try again.";
    plansError = settingsError = paymentsError = accessError = message;
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <main className="container space-y-6 py-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Payments & plans</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Choose a plan, pay by UPI, then submit your 12-digit UTR. Paid access activates only after an admin checks the bank statement and verifies your payment.
          </p>
        </div>
        <PaymentPanel
          plans={plans} settings={settings} initialPayments={payments} access={access}
          plansError={plansError} settingsError={settingsError} paymentsError={paymentsError} accessError={accessError}
        />
      </main>
    </div>
  );
}
