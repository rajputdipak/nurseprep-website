"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatPaymentAmount, formatPaymentDate, formatPaymentDuration, hasPaymentSnapshot,
  PAYMENT_SETUP_MESSAGE, paymentStatusLabel, postPayment,
  type Payment, type PaymentAccess, type PaymentCheckout, type PaymentPlan, type PaymentSettings,
} from "@/lib/payment-types";

interface PaymentPanelProps {
  plans: PaymentPlan[];
  settings: PaymentSettings | null;
  initialPayments: Payment[];
  access: PaymentAccess[];
  plansError: string | null;
  settingsError: string | null;
  paymentsError: string | null;
  accessError: string | null;
}

export function PaymentPanel({ plans, settings, initialPayments, access, plansError, settingsError, paymentsError, accessError }: PaymentPanelProps) {
  const router = useRouter();
  const [payments, setPayments] = useState(initialPayments);
  const [checkout, setCheckout] = useState<PaymentCheckout | null>(null);
  const [utr, setUtr] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [qrFailed, setQrFailed] = useState(false);
  const requestInFlight = useRef(false);
  const checkoutSection = useRef<HTMLElement>(null);
  const busy = Boolean(working) || refreshing;
  const payment = checkout ? payments.find((item) => item.id === checkout.payment.id) ?? checkout.payment : null;
  const settingsReady = Boolean(settings?.is_enabled && settings.upi_id?.trim() && settings.payee_name?.trim());
  const checkoutEnabled = settingsReady && !settingsError && !plansError && !paymentsError;
  const submitted = payments.filter((item) => item.status === "pending" && item.utr);
  const snapshotMissing = payments.some((item) => item.status === "pending" && !hasPaymentSnapshot(item));
  const warnings = Array.from(new Set([
    plansError, settingsError, paymentsError,
    settings && (!settings.upi_id?.trim() || !settings.payee_name?.trim()) ? PAYMENT_SETUP_MESSAGE : null,
    snapshotMissing ? `${PAYMENT_SETUP_MESSAGE}. A pending payment is missing its saved recipient or plan details. Contact an admin; do not pay again.` : null,
  ].filter((message): message is string => Boolean(message))));

  useEffect(() => {
    setPayments(initialPayments);
    setCheckout((current) => {
      if (!current) return null;
      const updated = initialPayments.find((item) => item.id === current.payment.id);
      return updated ? { ...current, payment: updated } : null;
    });
  }, [initialPayments]);

  const checkoutId = checkout?.payment.id;
  useEffect(() => {
    if (checkoutId) checkoutSection.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [checkoutId]);

  function refresh() {
    if (busy) return;
    setError(null);
    startTransition(() => router.refresh());
  }

  function reportError(cause: unknown) {
    const message = cause instanceof Error ? cause.message : "Request failed. Check your connection and refresh the status before trying again.";
    setError(message);
    toast.error(message);
  }

  async function choosePlan(planId: string, existingId?: string) {
    if (busy || requestInFlight.current || !checkoutEnabled) return;
    const awaitingReview = payments.find((item) => item.plan_id === planId && item.status === "pending" && item.utr);
    if (awaitingReview) {
      openPayment(awaitingReview);
      return;
    }
    requestInFlight.current = true;
    setWorking(planId);
    setError(null);
    try {
      const result = await postPayment<PaymentCheckout>("/api/payments/checkout", { plan_id: planId });
      if (!result?.payment?.id || !["pending", "verified", "rejected"].includes(result.payment.status)) {
        throw new Error("Could not read the payment intent. Refresh your history before trying again; do not pay twice.");
      }
      if (existingId && result.payment.id !== existingId) {
        startTransition(() => router.refresh());
        throw new Error("The payment intent changed. Refresh and check your history before proceeding. Do not pay again if money was already sent.");
      }
      setPayments((current) => [result.payment, ...current.filter((item) => item.id !== result.payment.id)].slice(0, 50));
      setCheckout(result);
      setUtr("");
      setQrFailed(false);
      if (result.payment.status === "pending" && !result.payment.utr && !hasPaymentSnapshot(result.payment)) {
        throw new Error(`${PAYMENT_SETUP_MESSAGE}. Saved payment details are incomplete. Do not pay.`);
      }
    } catch (cause) {
      reportError(cause);
    } finally {
      requestInFlight.current = false;
      setWorking(null);
    }
  }

  function openPayment(item: Payment) {
    if (busy) return;
    setCheckout({ payment: item, upi_uri: null, qr_data_url: null });
    setUtr("");
    setQrFailed(false);
    setError(null);
  }

  async function submitUtr(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payment || busy || requestInFlight.current || payment.status !== "pending" || payment.utr || paymentsError || !hasPaymentSnapshot(payment)) return;
    if (!/^\d{12}$/.test(utr.trim())) return toast.error("Enter the 12-digit UTR from your completed UPI payment.");
    requestInFlight.current = true;
    setWorking(payment.id);
    setError(null);
    try {
      await postPayment(`/api/payments/${encodeURIComponent(payment.id)}/utr`, { utr: utr.trim() });
      const updated = { ...payment, utr: utr.trim() };
      setPayments((current) => current.map((item) => item.id === payment.id ? updated : item));
      setCheckout({ payment: updated, upi_uri: null, qr_data_url: null });
      setUtr("");
      toast.success("UTR submitted — pending admin verification. This does not activate paid access.");
      startTransition(() => router.refresh());
    } catch (cause) {
      reportError(cause);
    } finally {
      requestInFlight.current = false;
      setWorking(null);
    }
  }

  const now = Date.now();
  const validAccess = access.filter((item) => item.status === "active" && Number.isFinite(Date.parse(item.starts_at)) && Date.parse(item.ends_at) > now && Date.parse(item.ends_at) > Date.parse(item.starts_at));
  const qrReady = typeof checkout?.qr_data_url === "string" && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(checkout.qr_data_url);
  const upiReady = typeof checkout?.upi_uri === "string" && checkout.upi_uri.startsWith("upi://pay?");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4" /> UPI payment · Manual bank verification</p>
        <Button variant="outline" onClick={refresh} disabled={busy}>
          <RefreshCw className={refreshing ? "animate-spin" : ""} /> {refreshing ? "Refreshing…" : "Refresh status"}
        </Button>
      </div>
      {warnings.map((message) => <p key={message} role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{message}</p>)}
      {error && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
      {!settingsError && settings && !settings.is_enabled && <p className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">New UPI payments are currently disabled. You can still check existing submissions below. If you already paid, do not pay again.</p>}
      {submitted.length > 0 && !paymentsError && (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          You have {submitted.length} submitted payment{submitted.length === 1 ? "" : "s"} pending admin verification. Do not pay again for a submitted payment. Use Refresh status to check the review.
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-lg">Your paid access</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {accessError ? <p role="alert" className="text-amber-800">Access status unavailable. {accessError}</p> : validAccess.length ? validAccess.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-2">
              <Badge variant={Date.parse(item.starts_at) <= now ? "success" : "secondary"}>{Date.parse(item.starts_at) <= now ? "Active paid access" : "Scheduled paid access"}</Badge>
              <span className="text-muted-foreground">{formatPaymentDate(item.starts_at)} – {formatPaymentDate(item.ends_at)}</span>
            </div>
          )) : <p className="text-muted-foreground">No active or scheduled paid interval is recorded. Your separate 7-day free trial is shown on the dashboard.</p>}
          <Link href="/dashboard" className="inline-block text-primary hover:underline">Back to dashboard</Link>
          <p className="text-xs text-muted-foreground">A pending payment or a submitted UTR does not grant access. Scheduled access begins at its saved start time.</p>
        </CardContent>
      </Card>

      <section id="plans" className="scroll-mt-24 space-y-4" aria-labelledby="plans-title">
        <h2 id="plans-title" className="text-xl font-semibold">Choose your plan</h2>
        {plansError ? <p className="text-sm text-muted-foreground">Plans are unavailable until payment data can be loaded.</p> : plans.length === 0 ? <p className="text-sm text-muted-foreground">No active paid plans are available right now.</p> : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => {
              const existing = payments.find((item) => item.plan_id === plan.id && item.status === "pending" && item.utr) ?? payments.find((item) => item.plan_id === plan.id && item.status === "pending");
              const planValid = Number.isFinite(plan.price) && plan.price > 0 && Number.isSafeInteger(plan.duration_days) && plan.duration_days > 0;
              return (
                <Card key={plan.id}>
                  <CardHeader>
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <div className="pt-2 text-3xl font-bold tracking-tight">{formatPaymentAmount(plan.price)}</div>
                    <CardDescription>{formatPaymentDuration(plan.duration_days)} of access</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {Array.isArray(plan.features) && <ul className="space-y-2 text-sm text-muted-foreground">{plan.features.filter((feature) => typeof feature === "string").map((feature, index) => <li key={index} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{feature}</li>)}</ul>}
                    <Button className="w-full" disabled={busy || !planValid || (!existing?.utr && !checkoutEnabled)} onClick={() => existing ? openPayment(existing) : choosePlan(plan.id)}>
                      {working === plan.id && <Loader2 className="animate-spin" />}
                      {existing?.utr ? "UTR submitted — view status" : existing ? "Continue existing payment" : "Choose plan"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {payment && (
        <section ref={checkoutSection} className="scroll-mt-24" aria-labelledby="checkout-title">
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle id="checkout-title" className="text-lg">{payment.utr ? "Your submitted payment" : "Payment details"}</CardTitle>
              <CardDescription>Payment reference: <span className="break-all">{payment.id}</span></CardDescription>
              <div className="pt-2"><Badge variant={payment.status === "verified" ? "success" : payment.status === "rejected" ? "destructive" : "warning"}>{paymentStatusLabel(payment)}</Badge></div>
            </CardHeader>
            <CardContent className="space-y-5">
              <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><dt className="text-muted-foreground">Saved plan</dt><dd className="mt-1 font-medium">{payment.plan_name || "Not recorded"}</dd></div>
                <div><dt className="text-muted-foreground">Amount / duration</dt><dd className="mt-1 font-medium">{formatPaymentAmount(payment.amount)} / {formatPaymentDuration(payment.duration_days)}</dd></div>
                <div><dt className="text-muted-foreground">Saved payee</dt><dd className="mt-1 break-words font-medium">{payment.payee_name || "Not recorded"}</dd></div>
                <div><dt className="text-muted-foreground">Saved UPI ID</dt><dd className="mt-1 break-all font-medium">{payment.upi_id || "Not recorded"}</dd></div>
              </dl>
              {payment.utr && <p className="text-sm">UTR: <span className="font-mono font-semibold">{payment.utr}</span></p>}
              {payment.status === "pending" && payment.utr ? (
                <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">UTR submitted — pending admin verification. Do not pay again. An admin must manually confirm receipt in the bank/UPI statement before paid access is activated.</p>
              ) : payment.status !== "pending" ? (
                <p className="text-sm text-muted-foreground">{payment.status === "verified" ? "An admin verified this payment. See your saved access interval above." : "This payment was rejected. Read the admin note and contact an admin if money was debited; do not pay again without checking."}</p>
              ) : !hasPaymentSnapshot(payment) ? (
                <p role="alert" className="text-sm text-amber-800">{PAYMENT_SETUP_MESSAGE}. This payment has incomplete saved details. Contact an admin before proceeding.</p>
              ) : (
                <div className="space-y-5">
                  <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Before paying, verify the recipient, UPI ID and exact amount in your UPI app. Pay only once. If money has already been sent, skip the QR and submit its UTR below. A QR scan alone is not proof of payment.</p>
                  {checkoutEnabled && qrReady && upiReady && !qrFailed ? (
                    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                      {/* A local data URL returned by checkout; no third-party QR service. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={checkout!.qr_data_url!} width={240} height={240} alt={`UPI payment QR for ${payment.payee_name}, ${formatPaymentAmount(payment.amount)}`} className="h-60 w-60 rounded-xl border bg-white p-2" onError={() => setQrFailed(true)} />
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">Scan with your UPI app, or open it on this device.</p>
                        <Button asChild variant="outline"><a href={checkout!.upi_uri!}>Open UPI app</a></Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">{qrFailed ? "QR could not be displayed. Reload the saved payment details, or submit the UTR if you already paid." : "Already paid? Submit the UTR below. Otherwise, load the QR for this existing payment."}</p>
                      {payment.plan_id && <Button variant="outline" onClick={() => choosePlan(payment.plan_id!, payment.id)} disabled={busy || !checkoutEnabled}><RefreshCw className={working === payment.plan_id ? "animate-spin" : ""} /> Load saved payment QR</Button>}
                    </div>
                  )}
                  <form onSubmit={submitUtr} className="max-w-md space-y-3" aria-busy={busy}>
                    <Label htmlFor="payment-utr">12-digit UTR / bank reference number</Label>
                    <Input id="payment-utr" value={utr} onChange={(event) => setUtr(event.target.value)} inputMode="numeric" autoComplete="off" minLength={12} maxLength={12} pattern="[0-9]{12}" required disabled={busy || Boolean(paymentsError)} aria-describedby="utr-help" />
                    <p id="utr-help" className="text-xs text-muted-foreground">Find this number in the details of your completed UPI transaction. Submit only after sending the exact amount to the saved recipient.</p>
                    <Button type="submit" className="h-auto min-h-10 w-full whitespace-normal py-2 sm:w-auto" disabled={busy || Boolean(paymentsError) || !/^\d{12}$/.test(utr)}>{working === payment.id && <Loader2 className="animate-spin" />} Submit UTR for admin verification</Button>
                  </form>
                </div>
              )}
              {payment.admin_note && <p className="whitespace-pre-wrap break-words rounded-xl bg-muted p-3 text-sm"><span className="font-medium">Admin note: </span>{payment.admin_note}</p>}
            </CardContent>
          </Card>
        </section>
      )}

      <section className="space-y-4" aria-labelledby="history-title">
        <div><h2 id="history-title" className="text-xl font-semibold">Payment history</h2><p className="mt-1 text-sm text-muted-foreground">Your latest 50 payment intents. Unsubmitted intents are not proof that money was sent.</p></div>
        {paymentsError ? <p role="alert" className="text-sm text-amber-800">History unavailable. {paymentsError}</p> : payments.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted-foreground">No payment intents yet. Choose an available plan to begin.</CardContent></Card> : payments.map((item) => (
          <Card key={item.id}>
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="font-semibold">{item.plan_name || "Plan name not recorded"}</h3><p className="mt-1 text-sm text-muted-foreground">{formatPaymentAmount(item.amount)} · {formatPaymentDuration(item.duration_days)}</p></div>
                <Badge variant={item.status === "verified" ? "success" : item.status === "rejected" ? "destructive" : "warning"}>{paymentStatusLabel(item)}</Badge>
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p className="break-all">Reference: {item.id}</p>
                <p>Created: {formatPaymentDate(item.created_at)}</p>
                {item.reviewed_at && <p>Reviewed: {formatPaymentDate(item.reviewed_at)}</p>}
                <p>UTR: <span className="font-mono">{item.utr || "Not submitted"}</span></p>
              </div>
              {item.admin_note && <p className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm"><span className="font-medium">Admin note: </span>{item.admin_note}</p>}
              <Button variant="outline" size="sm" disabled={busy} onClick={() => openPayment(item)}>{item.status === "pending" && !item.utr ? "Continue / submit UTR" : "View details"}</Button>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
