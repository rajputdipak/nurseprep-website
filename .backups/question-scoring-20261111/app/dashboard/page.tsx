import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GraduationCap, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { Exam, Profile } from "@/lib/types";
import { SiteHeader } from "@/components/site-header";
import { ExamCard } from "@/components/exam-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

  const daysUsed = Math.floor(
    (Date.now() - new Date(profile.created_at).getTime()) / 86400000
  );
  const daysLeft = Math.max(0, 30 - daysUsed);

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
            <Badge variant={daysLeft > 0 ? "success" : "warning"} className="self-start px-3 py-1.5 text-sm sm:self-center">
              {daysLeft > 0 ? `Free Access — ${daysLeft} days left` : "Free access ended"}
            </Badge>
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