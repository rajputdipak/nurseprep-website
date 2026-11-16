import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ReviewQuestion } from "@/lib/types";
import { SiteHeader } from "@/components/site-header";
import { ResultView } from "@/components/result-view";
import { DatabaseNotice } from "@/components/database-notice";
import { isDatabaseUpdateRequired } from "@/lib/database-status";

export const metadata: Metadata = { title: "Result" };

interface AttemptResult {
  id: string;
  status: "in_progress" | "submitted";
  score: number;
  total: number;
  marks_per_correct: number;
  negative_marks: number;
  correct_count: number;
  wrong_count: number;
  skipped_count: number;
  started_at: string;
  submitted_at: string | null;
  tests: { name: string } | null;
}

export default async function ResultPage({ params }: { params: { attemptId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: attempt, error: attemptError } = await supabase
    .from("user_attempts")
    .select("id, status, score, total, marks_per_correct, negative_marks, correct_count, wrong_count, skipped_count, started_at, submitted_at, tests(name)")
    .eq("id", params.attemptId)
    .eq("user_id", user.id)
    .maybeSingle<AttemptResult>();

  if (attemptError) {
    return (
      <div className="min-h-screen bg-muted/40">
        <SiteHeader />
        <main className="container py-8">
          <DatabaseNotice updateRequired={isDatabaseUpdateRequired(attemptError)} />
        </main>
      </div>
    );
  }
  if (!attempt) redirect("/dashboard");
  if (attempt.status === "in_progress") redirect(`/test/${attempt.id}`);

  const { data: review, error } = await supabase.rpc("get_attempt_review", {
    p_attempt_id: attempt.id,
  });
  if (error || !review) {
    return (
      <div className="min-h-screen bg-muted/40">
        <SiteHeader />
        <main className="container py-8">
          <DatabaseNotice updateRequired={isDatabaseUpdateRequired(error)} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <SiteHeader />
      <ResultView
        testName={attempt.tests?.name ?? "Test"}
        score={attempt.score}
        total={attempt.total}
        marksPerCorrect={attempt.marks_per_correct}
        negativeMarks={attempt.negative_marks}
        correct={attempt.correct_count}
        wrong={attempt.wrong_count}
        skipped={attempt.skipped_count}
        submittedAt={attempt.submitted_at}
        review={review as ReviewQuestion[]}
      />
    </div>
  );
}