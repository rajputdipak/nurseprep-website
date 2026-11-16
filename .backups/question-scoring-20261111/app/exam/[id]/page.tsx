import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock, FileQuestion, History } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TEST_CATEGORY_LABELS, type Exam, type Test, type TestCategory } from "@/lib/types";
import { SiteHeader } from "@/components/site-header";
import { StartTestButton } from "@/components/start-test-button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Exam" };

const CATEGORY_ORDER: TestCategory[] = ["full_mock", "subject_test", "daily_quiz", "pyq"];
const CATEGORY_DESCRIPTIONS: Record<TestCategory, string> = {
  full_mock: "Complete exam-pattern paper with all subjects",
  subject_test: "Focused practice on one subject",
  daily_quiz: "Quick 10-question daily practice",
  pyq: "Previous year question pattern practice",
};

interface AttemptRow {
  id: string;
  status: "in_progress" | "submitted";
  score: number;
  total: number;
  started_at: string;
  tests: { name: string } | null;
}

export default async function ExamDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: exam } = await supabase
    .from("exams")
    .select("*")
    .eq("id", params.id)
    .eq("is_active", true)
    .single<Exam>();
  if (!exam) notFound();

  const { data: tests } = await supabase
    .from("tests")
    .select("*")
    .eq("exam_id", exam.id)
    .eq("is_active", true)
    .returns<Test[]>();

  const sortedTests = CATEGORY_ORDER.map((c) => (tests ?? []).find((t) => t.category === c)).filter(
    (t): t is Test => Boolean(t)
  );

  const testIds = (tests ?? []).map((t) => t.id);
  const { data: attempts } = testIds.length
    ? await supabase
        .from("user_attempts")
        .select("id, status, score, total, started_at, tests(name)")
        .eq("user_id", user.id)
        .in("test_id", testIds)
        .order("started_at", { ascending: false })
        .limit(5)
        .returns<AttemptRow[]>()
    : { data: [] as AttemptRow[] };

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <main className="container max-w-4xl space-y-8 py-8">
        <div className="animate-fade-up space-y-2">
          <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" /> Dashboard
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold sm:text-3xl">{exam.name}</h1>
            <Badge variant={exam.category === "central" ? "default" : "secondary"}>
              {exam.category === "central" ? "Central" : "State"}
            </Badge>
          </div>
          <p className="text-muted-foreground">{exam.description}</p>
        </div>

        <section className="grid gap-4 sm:grid-cols-2">
          {sortedTests.map((test) => (
            <Card key={test.id} className="animate-fade-up">
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">{TEST_CATEGORY_LABELS[test.category]}</h2>
                  <FileQuestion className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">{CATEGORY_DESCRIPTIONS[test.category]}</p>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <FileQuestion className="h-4 w-4" /> {test.question_count} questions
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-4 w-4" /> {test.duration_minutes} min
                  </span>
                </div>
                <div className="mt-auto pt-2">
                  <StartTestButton testId={test.id} />
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <History className="h-5 w-5 text-muted-foreground" /> Recent attempts
          </h2>
          {(attempts ?? []).length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No attempts yet. Start your first test above.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="divide-y p-0">
                {(attempts ?? []).map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{a.tests?.name ?? "Test"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(a.started_at).toLocaleString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {a.status === "submitted" ? (
                        <>
                          <Badge variant="secondary">
                            {a.score}/{a.total}
                          </Badge>
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/result/${a.id}`}>Result</Link>
                          </Button>
                        </>
                      ) : (
                        <>
                          <Badge variant="warning">In progress</Badge>
                          <Button size="sm" asChild>
                            <Link href={`/test/${a.id}`}>
                              Resume <ArrowRight className="h-4 w-4" />
                            </Link>
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </section>
      </main>
    </div>
  );
}