"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  formatPaymentAmount, formatPaymentDate, formatPaymentDuration, hasPaymentSnapshot,
  PAYMENT_SETUP_MESSAGE, paymentStatusLabel, postPayment,
  type AdminPayment, type PaymentPlan, type PaymentSettings,
} from "@/lib/payment-types";

interface PaymentsManagerProps {
  settings: PaymentSettings | null;
  plans: PaymentPlan[];
  initialPayments: AdminPayment[];
  pendingCount: number | null;
  settingsError: string | null;
  plansError: string | null;
  paymentsError: string | null;
  countError: string | null;
  emailReady: boolean;
}

interface PlanDraft {
  price: string;
  duration_days: string;
  is_active: boolean;
}

function makePlanDrafts(plans: PaymentPlan[]): Record<string, PlanDraft> {
  return Object.fromEntries(plans.map((plan) => [plan.id, {
    price: Number.isFinite(plan.price) ? String(plan.price) : "",
    duration_days: Number.isSafeInteger(plan.duration_days) ? String(plan.duration_days) : "",
    is_active: plan.is_active,
  }]));
}

export function PaymentsManager({ settings, plans, initialPayments, pendingCount, settingsError, plansError, paymentsError, countError, emailReady }: PaymentsManagerProps) {
  const router = useRouter();
  const [upiId, setUpiId] = useState(settings?.upi_id ?? "");
  const [payeeName, setPayeeName] = useState(settings?.payee_name ?? "");
  const [enabled, setEnabled] = useState(settings?.is_enabled ?? false);
  const [drafts, setDrafts] = useState(() => makePlanDrafts(plans));
  const [payments, setPayments] = useState(initialPayments);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const requestInFlight = useRef(false);
  const busy = Boolean(working) || refreshing;
  const selected = payments.find((item) => item.id === selectedId);
  const submissions = payments.filter((item) => item.utr !== null);
  const visibleSubmissions = submissions.filter((item) => filter === "all" || item.status === filter);
  const settingsValid = upiId.trim().length <= 165 && payeeName.trim().length <= 100 &&
    (upiId.trim() === "" || /^[A-Za-z0-9._-]{2,100}@[A-Za-z0-9]{2,64}$/.test(upiId.trim())) &&
    (!enabled || Boolean(upiId.trim() && payeeName.trim()));
  const warnings = Array.from(new Set([settingsError, plansError, paymentsError, countError,
    !settings && !settingsError ? `${PAYMENT_SETUP_MESSAGE}. Save the actual recipient details below before enabling checkout.` : null,
  ].filter((message): message is string => Boolean(message))));

  useEffect(() => {
    setUpiId(settings?.upi_id ?? "");
    setPayeeName(settings?.payee_name ?? "");
    setEnabled(settings?.is_enabled ?? false);
  }, [settings]);
  useEffect(() => setDrafts(makePlanDrafts(plans)), [plans]);
  useEffect(() => setPayments(initialPayments), [initialPayments]);

  function refresh() {
    if (busy) return;
    setError(null);
    startTransition(() => router.refresh());
  }

  async function saveRequest(key: string, url: string, payload: unknown, message: string, onSaved?: () => void) {
    if (busy || requestInFlight.current) return;
    requestInFlight.current = true;
    setWorking(key);
    setError(null);
    try {
      await postPayment(url, payload);
      onSaved?.();
      toast.success(message);
      startTransition(() => router.refresh());
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "Request failed. Refresh the status before trying again.";
      setError(detail);
      toast.error(detail);
    } finally {
      requestInFlight.current = false;
      setWorking(null);
    }
  }

  function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (settingsError) return;
    if (!settingsValid) return toast.error("Use a valid UPI ID (up to 165 characters) and payee name (up to 100). Both are required when payments are enabled.");
    void saveRequest("settings", "/api/admin/payment-settings", { upi_id: upiId.trim(), payee_name: payeeName.trim(), is_enabled: enabled }, "Payment settings saved. Existing intents retain their saved recipient details.");
  }

  function validPlan(draft: PlanDraft | undefined): boolean {
    if (!draft) return false;
    const price = Number(draft.price);
    const days = Number(draft.duration_days);
    return /^\d+(?:\.\d{1,2})?$/.test(draft.price) && Number.isFinite(price) && price >= 0 && price <= 100000 && /^\d+$/.test(draft.duration_days) && Number.isSafeInteger(days) && days > 0 && days <= 3650;
  }

  function savePlan(event: React.FormEvent<HTMLFormElement>, plan: PaymentPlan) {
    event.preventDefault();
    const draft = drafts[plan.id];
    if (plansError || !draft) return;
    if (!validPlan(draft)) return toast.error("Enter a price from ₹0 to ₹100,000 with up to 2 decimals and a whole-number duration from 1 to 3,650 days.");
    void saveRequest(plan.id, `/api/admin/plans/${encodeURIComponent(plan.id)}`, {
      price: Number(draft.price), duration_days: Number(draft.duration_days), is_active: draft.is_active,
    }, `${plan.name} updated. Existing payment snapshots are unchanged.`);
  }

  function changePlan(id: string, changes: Partial<PlanDraft>) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...changes } }));
  }

  function openReview(payment: AdminPayment) {
    if (busy) return;
    setSelectedId(payment.id);
    setNote("");
    setConfirmed(false);
    setError(null);
  }

  function review(decision: "verified" | "rejected") {
    if (!selected || selected.status !== "pending" || !selected.utr || busy || paymentsError) return;
    if (note.trim().length > 500) return toast.error("Keep the admin note to 500 characters or fewer.");
    if (decision === "verified" && (!confirmed || !hasPaymentSnapshot(selected))) {
      return toast.error("Verify the saved payment details against the bank/UPI statement and confirm receipt first.");
    }
    if (decision === "rejected" && !note.trim()) return toast.error("Add a reason so the student understands the rejection.");
    void saveRequest(selected.id, `/api/admin/payments/${encodeURIComponent(selected.id)}/review`, {
      decision, note: note.trim(), confirm_received: decision === "verified" && confirmed,
    }, decision === "verified" ? "Payment verified. Access is granted by the server using its saved duration." : "Payment rejected. No paid access was granted.", () => {
      setSelectedId(null);
      setConfirmed(false);
      setNote("");
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Payments</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">Configure UPI collection and review submitted bank references. A submitted UTR is not proof of receipt: check your bank/UPI statement before approving.</p>
          <p role="status" className={`max-w-2xl text-sm ${emailReady ? "text-emerald-700" : "text-amber-800"}`}>
            {emailReady
              ? "Email alerts are on — admins are mailed on UTR submission and students on approval or rejection."
              : "Email alerts are off — set SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM to notify admins and students automatically."}
          </p>
        </div>
        <Button variant="outline" disabled={busy} onClick={refresh}><RefreshCw className={refreshing ? "animate-spin" : ""} />{refreshing ? "Refreshing…" : "Refresh status"}</Button>
      </div>
      {warnings.map((message) => <p key={message} role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{message}</p>)}
      {error && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">UPI payment settings</CardTitle>
          <CardDescription>These recipient details appear in every new UPI QR. Confirm the bank account before enabling checkout.</CardDescription>
        </CardHeader>
        <CardContent>
          {settingsError ? <p className="text-sm text-muted-foreground">Settings are unavailable. Resolve the setup or connection issue, then refresh before editing.</p> : (
            <form className="space-y-4" onSubmit={saveSettings} aria-busy={busy}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="admin-upi-id">Recipient UPI ID</Label><Input id="admin-upi-id" value={upiId} onChange={(event) => setUpiId(event.target.value)} maxLength={165} required={enabled} disabled={busy} autoCapitalize="none" autoComplete="off" spellCheck={false} /></div>
                <div className="space-y-2"><Label htmlFor="admin-payee-name">Payee name</Label><Input id="admin-payee-name" value={payeeName} onChange={(event) => setPayeeName(event.target.value)} maxLength={100} required={enabled} disabled={busy} /></div>
              </div>
              <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} disabled={busy} /><span>Enable new UPI payments</span></label>
              <p className="text-xs text-muted-foreground">Confirm the account details before enabling checkout. Changes apply to new intents; existing intents keep their saved recipient, amount and duration.</p>
              <Button type="submit" disabled={busy || !settingsValid}>{working === "settings" && <Loader2 className="animate-spin" />}Save payment settings</Button>
            </form>
          )}
        </CardContent>
      </Card>

      <section className="space-y-4" aria-labelledby="admin-plans-title">
        <div><h3 id="admin-plans-title" className="text-lg font-semibold">Plan pricing & availability</h3><p className="mt-1 text-sm text-muted-foreground">Names are preserved. Price and duration changes apply to new payment intents only.</p></div>
        {plansError ? <p role="alert" className="text-sm text-amber-800">Plans unavailable. {plansError}</p> : plans.length === 0 ? <p className="text-sm text-muted-foreground">No plans are configured.</p> : (
          <div className="grid gap-4 lg:grid-cols-2">
            {plans.map((plan) => {
              const draft = drafts[plan.id];
              return (
                <Card key={plan.id}>
                  <CardHeader><CardTitle className="text-base">{plan.name}</CardTitle><CardDescription>Saved: {formatPaymentAmount(plan.price)} · {formatPaymentDuration(plan.duration_days)}</CardDescription></CardHeader>
                  <CardContent>
                    <form className="space-y-4" onSubmit={(event) => savePlan(event, plan)} aria-busy={busy}>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2"><Label htmlFor={`price-${plan.id}`}>Price (INR)</Label><Input id={`price-${plan.id}`} type="number" inputMode="decimal" min={0} max={100000} step="0.01" value={draft?.price ?? ""} onChange={(event) => changePlan(plan.id, { price: event.target.value })} required disabled={busy} /></div>
                        <div className="space-y-2"><Label htmlFor={`duration-${plan.id}`}>Duration (days)</Label><Input id={`duration-${plan.id}`} type="number" inputMode="numeric" min={1} max={3650} step={1} value={draft?.duration_days ?? ""} onChange={(event) => changePlan(plan.id, { duration_days: event.target.value })} required disabled={busy} /></div>
                      </div>
                      <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={draft?.is_active ?? false} onChange={(event) => changePlan(plan.id, { is_active: event.target.checked })} disabled={busy} /><span>Active plan</span></label>
                      <p className="text-xs text-muted-foreground">Only active plans priced above ₹0 appear in paid checkout. The account&apos;s 7-day free trial remains separate.</p>
                      <Button type="submit" variant="outline" disabled={busy || !validPlan(draft)}>{working === plan.id && <Loader2 className="animate-spin" />}Save {plan.name}</Button>
                    </form>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="submissions-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="submissions-title" className="text-lg font-semibold">UTR submissions</h3>
          <Badge variant={pendingCount === null ? "secondary" : "warning"}>{pendingCount === null ? "Pending count unavailable" : `${pendingCount} pending review total`}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">Showing submitted UTRs within the latest 100 payment intents. Unsubmitted intents are excluded; the pending total can include older submissions not shown here.</p>
        <div className="max-w-xs space-y-2">
          <Label htmlFor="payment-status-filter">Filter by status</Label>
          <select id="payment-status-filter" value={filter} onChange={(event) => setFilter(event.target.value)} disabled={busy || Boolean(paymentsError)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
            <option value="all">All submissions</option><option value="pending">Pending review</option><option value="verified">Verified</option><option value="rejected">Rejected</option>
          </select>
        </div>
        {paymentsError ? <p role="alert" className="text-sm text-amber-800">Submissions unavailable. {paymentsError}</p> : visibleSubmissions.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted-foreground">No matching UTR submissions in the latest 100 payment intents.</CardContent></Card> : visibleSubmissions.map((item) => (
          <Card key={item.id}>
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-semibold">{item.student?.full_name || "Student profile unavailable"}</p><p className="break-all text-sm text-muted-foreground">{item.student?.email || item.user_id}</p></div>
                <Badge variant={item.status === "verified" ? "success" : item.status === "rejected" ? "destructive" : "warning"}>{paymentStatusLabel(item)}</Badge>
              </div>
              <p className="text-sm">{item.plan_name || "Plan snapshot unavailable"} · {formatPaymentAmount(item.amount)} · {formatPaymentDuration(item.duration_days)}</p>
              <p className="text-sm">UTR: <span className="font-mono font-semibold">{item.utr}</span></p>
              <p className="text-xs text-muted-foreground">Created: {formatPaymentDate(item.created_at)}{item.reviewed_at ? ` · Reviewed: ${formatPaymentDate(item.reviewed_at)}` : ""}</p>
              {item.admin_note && <p className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm"><span className="font-medium">Admin note: </span>{item.admin_note}</p>}
              <Button variant="outline" size="sm" onClick={() => openReview(item)} disabled={busy}>{item.status === "pending" ? "Review payment" : "View review details"}</Button>
            </CardContent>
          </Card>
        ))}
      </section>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open && !busy) { setSelectedId(null); setConfirmed(false); setError(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>{selected?.status === "pending" ? "Review UTR submission" : "Payment review details"}</DialogTitle><DialogDescription>Match the saved recipient, amount and UTR against your actual bank/UPI statement. Never approve based on the UTR alone.</DialogDescription></DialogHeader>
          {selected && (
            <>
              <Badge className="w-fit" variant={selected.status === "verified" ? "success" : selected.status === "rejected" ? "destructive" : "warning"}>{paymentStatusLabel(selected)}</Badge>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Student</dt><dd className="break-words font-medium">{selected.student?.full_name || "Profile unavailable"}</dd><dd className="break-all text-xs">{selected.student?.email || selected.user_id}</dd></div>
                <div><dt className="text-muted-foreground">UTR</dt><dd className="font-mono font-semibold">{selected.utr}</dd></div>
                <div><dt className="text-muted-foreground">Saved plan</dt><dd className="font-medium">{selected.plan_name || "Not recorded"}</dd></div>
                <div><dt className="text-muted-foreground">Saved amount / duration</dt><dd className="font-medium">{formatPaymentAmount(selected.amount)} / {formatPaymentDuration(selected.duration_days)}</dd></div>
                <div><dt className="text-muted-foreground">Saved payee</dt><dd className="break-words font-medium">{selected.payee_name || "Not recorded"}</dd></div>
                <div><dt className="text-muted-foreground">Saved UPI ID</dt><dd className="break-all font-medium">{selected.upi_id || "Not recorded"}</dd></div>
                <div><dt className="text-muted-foreground">Created</dt><dd>{formatPaymentDate(selected.created_at)}</dd></div>
                {selected.reviewed_at && <div><dt className="text-muted-foreground">Reviewed</dt><dd>{formatPaymentDate(selected.reviewed_at)}</dd></div>}
                <div className="sm:col-span-2"><dt className="text-muted-foreground">Payment reference</dt><dd className="break-all text-xs">{selected.id}</dd></div>
                {selected.reviewed_by && <div className="sm:col-span-2"><dt className="text-muted-foreground">Reviewed by</dt><dd className="break-all text-xs">{selected.reviewed_by}</dd></div>}
              </dl>
              {!hasPaymentSnapshot(selected) && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{PAYMENT_SETUP_MESSAGE}. Saved payment details are incomplete. Verification is disabled; do not substitute current plan or recipient settings.</p>}
              {selected.admin_note && <p className="whitespace-pre-wrap break-words rounded-xl bg-muted p-3 text-sm"><span className="font-medium">Final admin note: </span>{selected.admin_note}</p>}
              {selected.status === "pending" ? (
                <>
                  <div className="space-y-2"><Label htmlFor="payment-review-note">Admin note (required for rejection)</Label><textarea id="payment-review-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={3} disabled={busy} className="w-full rounded-xl border border-input bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" /><p className="text-xs text-muted-foreground">Visible to the student. Maximum 500 characters. Do not include private bank information.</p></div>
                  <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy || !hasPaymentSnapshot(selected)} className="mt-0.5 h-4 w-4 shrink-0 accent-primary" /><span>I checked the bank/UPI statement and received this amount</span></label>
                  <p className="text-xs text-muted-foreground">Verification grants access for the saved duration. Rejection does not grant access. Final reviews cannot be changed here.</p>
                  {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setSelectedId(null)} disabled={busy}>Cancel</Button>
                    <Button variant="destructive" onClick={() => review("rejected")} disabled={busy || Boolean(paymentsError) || !note.trim()}>Reject</Button>
                    <Button onClick={() => review("verified")} disabled={busy || Boolean(paymentsError) || !confirmed || !hasPaymentSnapshot(selected)}>{working === selected.id && <Loader2 className="animate-spin" />}Verify & grant access</Button>
                  </DialogFooter>
                </>
              ) : <DialogFooter><Button variant="outline" onClick={() => setSelectedId(null)}>Close</Button></DialogFooter>}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
