import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { Exam, Profile } from "@/lib/types";
import { ACCESS_COLUMNS, formatPaymentDate, type PaymentAccess } from "@/lib/payment-types";
import { getTrialState } from "@/lib/access";
import { SiteHeader } from "@/components/site-header";
import { TrialAccessStatus } from "@/components/trial-access-status";
import { ExamCard } from "@/components/exam-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();
  if (!profile) redirect("/login");

  const { data: exams } = await supabase
    .from("exams")
    .select("*")
    .eq("is_active", true)
    .order("name")
    .returns<Exam[]>();

  const now = Date.now();
  const trial = getTrialState(profile.created_at, now);
  let paidIntervals: PaymentAccess[] = [];
  let accessUnavailable = false;
  try {
    const { data, error } = await supabase
      .from("user_plans")
      .select(ACCESS_COLUMNS)
      .eq("user_id", user.id)
      .eq("status", "active")
      .gt("ends_at", new Date(now).toISOString())
      .order("starts_at")
      .returns<PaymentAccess[]>();
    accessUnavailable = Boolean(error);
    paidIntervals = data ?? [];
    if (paidIntervals.some((item) => !Number.isFinite(Date.parse(item.starts_at)) || !Number.isFinite(Date.parse(item.ends_at)) || Date.parse(item.ends_at) <= Date.parse(item.starts_at))) {
      accessUnavailable = true;
    }
  } catch {
    accessUnavailable = true;
  }
  const activePaid = paidIntervals.filter((item) => item.status === "active" && Date.parse(item.starts_at) <= now && now < Date.parse(item.ends_at));
  const scheduledPaid = paidIntervals.filter((item) => item.status === "active" && Date.parse(item.starts_at) > now && Date.parse(item.ends_at) > Date.parse(item.starts_at));

  const central = (exams ?? []).filter((e) => e.category === "central");
  const state = (exams ?? []).filter((e) => e.category === "state");

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <main className="container space-y-8 py-8">
        <Card className="animate-fade-up">
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-xl font-semibold text-primary-foreground">
                {profile.full_name.charAt(0).toUpperCase() || "N"}
              </div>
              <div>
                <h1 className="text-lg font-semibold">{profile.full_name}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <GraduationCap className="h-4 w-4" /> {profile.course} Nursing
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-4 w-4" /> {profile.email}
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-2 self-start sm:max-w-sm sm:self-center sm:text-right">
              {profile.role === "admin" && <Badge variant="success" className="px-3 py-1.5 text-sm">Admin access</Badge>}
              {accessUnavailable ? (
                <p role="status" className="text-sm text-amber-800">Paid access status unavailable. Refresh to try again.</p>
              ) : activePaid.length > 0 ? (
                <div className="space-y-2">
                  <Badge variant="success" className="px-3 py-1.5 text-sm">Paid access active</Badge>
                  {activePaid.map((interval) => <p key={interval.id} className="text-xs text-muted-foreground">{formatPaymentDate(interval.starts_at)} – {formatPaymentDate(interval.ends_at)}</p>)}
                </div>
              ) : profile.role !== "admin" && (
                <TrialAccessStatus createdAt={profile.created_at} initial={trial} />
              )}
              {!accessUnavailable && scheduledPaid.map((interval) => (
                <div key={interval.id} className="space-y-1">
                  <Badge variant="secondary">Paid access scheduled</Badge>
                  <p className="text-xs text-muted-foreground">{formatPaymentDate(interval.starts_at)} – {formatPaymentDate(interval.ends_at)}</p>
                </div>
              ))}
              {(accessUnavailable || activePaid.length > 0 || profile.role === "admin") && (
                <TrialAccessStatus createdAt={profile.created_at} initial={trial} mode="line" />
              )}
              <p className="text-xs text-muted-foreground">Pending payments do not activate paid access.</p>
              <Button variant="outline" size="sm" asChild><Link href="/payments">Payments & plans</Link></Button>
            </div>
          </CardContent>
        </Card>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Central Exams</h2>
            <Badge variant="secondary">{central.length}</Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {central.map((exam) => (
              <ExamCard key={exam.id} exam={exam} />
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">State Exams</h2>
            <Badge variant="secondary">{state.length}</Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {state.map((exam) => (
              <ExamCard key={exam.id} exam={exam} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}