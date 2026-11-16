import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AttemptQuestion, OptionKey } from "@/lib/types";
import { TestEngine } from "@/components/test-engine";

export const metadata: Metadata = { title: "Test in progress" };

interface AttemptWithTest {
  id: string;
  status: "in_progress" | "submitted";
  answers: Record<string, OptionKey>;
  started_at: string;
  marks_per_correct: number;
  negative_marks: number;
  tests: { name: string; duration_minutes: number } | null;
}

export default async function TestPage({ params }: { params: { attemptId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: attempt } = await supabase
    .from("user_attempts")
    .select("id, status, answers, started_at, marks_per_correct, negative_marks, tests(name, duration_minutes)")
    .eq("id", params.attemptId)
    .eq("user_id", user.id)
    .single<AttemptWithTest>();

  if (!attempt) redirect("/dashboard");
  if (attempt.status === "submitted") redirect(`/result/${attempt.id}`);

  const { data: questions, error } = await supabase.rpc("get_attempt_questions", {
    p_attempt_id: attempt.id,
  });
  if (error || !questions) redirect("/dashboard");

  return (
    <TestEngine
      attemptId={attempt.id}
      testName={attempt.tests?.name ?? "Test"}
      durationMinutes={attempt.tests?.duration_minutes ?? 60}
      startedAt={attempt.started_at}
      marksPerCorrect={attempt.marks_per_correct}
      negativeMarks={attempt.negative_marks}
      initialAnswers={attempt.answers ?? {}}
      questions={questions as AttemptQuestion[]}
    />
  );
}