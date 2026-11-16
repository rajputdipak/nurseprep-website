"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, Lightbulb, MinusCircle, XCircle } from "lucide-react";
import { OPTION_LABELS, optionText, type OptionKey, type ReviewQuestion } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const OPTION_KEYS: OptionKey[] = ["a", "b", "c", "d"];
const marksFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 });

interface Props {
  testName: string;
  score: number;
  total: number;
  marksPerCorrect: number;
  negativeMarks: number;
  correct: number;
  wrong: number;
  skipped: number;
  submittedAt: string | null;
  review: ReviewQuestion[];
}

export function ResultView({ testName, score, total, marksPerCorrect, negativeMarks, correct, wrong, skipped, submittedAt, review }: Props) {
  const maxMarks = total * marksPerCorrect;
  const earnedMarks = correct * marksPerCorrect;
  const deductions = wrong * negativeMarks;
  const percentage = maxMarks > 0 ? (score / maxMarks) * 100 : 0;
  const ringPercentage = Math.min(100, Math.max(0, percentage));

  const subjects = new Map<string, { total: number; correct: number }>();
  for (const q of review) {
    const s = subjects.get(q.subject) ?? { total: 0, correct: 0 };
    s.total += 1;
    if (q.user_answer === q.correct_answer) s.correct += 1;
    subjects.set(q.subject, s);
  }

  return (
    <main className="container max-w-3xl space-y-6 py-8">
        <div className="animate-fade-up space-y-1">
          <p className="text-sm text-muted-foreground">Result</p>
          <h1 className="text-2xl font-bold">{testName}</h1>
          {submittedAt && (
            <p className="text-sm text-muted-foreground">
              Submitted{" "}
              {new Date(submittedAt).toLocaleString("en-IN", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Asia/Kolkata",
              })}{" IST"}
            </p>
          )}
        </div>

        {/* Score */}
        <Card className="animate-fade-up">
          <CardContent className="space-y-6 p-6 sm:p-8">
            <div className="flex flex-col items-center gap-6 sm:flex-row">
              <div className="relative flex h-36 w-36 shrink-0 items-center justify-center">
                <svg className="h-36 w-36 -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
                  <circle cx="60" cy="60" r="52" fill="none" strokeWidth="10" className="stroke-secondary" />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    strokeWidth="10"
                    strokeLinecap="round"
                    className={cn(
                      "transition-all duration-1000",
                      percentage >= 60 ? "stroke-emerald-500" : percentage >= 40 ? "stroke-amber-500" : "stroke-red-500"
                    )}
                    strokeDasharray={`${(ringPercentage / 100) * 326.7} 326.7`}
                    opacity={ringPercentage === 0 ? 0 : 1}
                  />
                </svg>
                <div className="absolute max-w-28 text-center">
                  <p className={cn("break-words font-bold tabular-nums", Math.abs(percentage) >= 1000 ? "text-sm" : "text-xl")}>
                    {marksFormat.format(percentage)}%
                  </p>
                  <p className="text-xs text-muted-foreground">Net marks %</p>
                </div>
              </div>
              <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
                <h2 className="text-sm font-medium text-muted-foreground">Net marks</h2>
                <p className="break-words text-2xl font-bold tabular-nums">
                  {marksFormat.format(score)} / {marksFormat.format(maxMarks)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Maximum {marksFormat.format(maxMarks)} marks · {total} questions
                </p>
                <p className="text-xs text-muted-foreground">
                  Uses this attempt&apos;s saved marking scheme.{" "}
                  {negativeMarks > 0 ? "Net marks can be below zero." : "No wrong-answer deductions for this attempt."}
                </p>
              </div>
            </div>
            <dl className="space-y-2 border-t pt-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt>Correct: {correct} × {marksFormat.format(marksPerCorrect)}</dt>
                <dd className="font-medium tabular-nums text-emerald-700">+{marksFormat.format(earnedMarks)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Wrong-answer deductions: {wrong} × {marksFormat.format(negativeMarks)}</dt>
                <dd className="font-medium tabular-nums text-red-700">
                  {deductions > 0 ? "-" : ""}{marksFormat.format(deductions)}
                </dd>
              </div>
              <div className="flex justify-between gap-3 text-muted-foreground">
                <dt>Skipped: {skipped} × 0</dt>
                <dd className="tabular-nums">0</dd>
              </div>
              <div className="flex justify-between gap-3 border-t pt-2 font-semibold">
                <dt>Net marks after deductions</dt>
                <dd className="tabular-nums">{marksFormat.format(score)}</dd>
              </div>
            </dl>
            <div className="grid grid-cols-3 gap-3">
              <StatBox icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />} label="Correct" value={correct} />
              <StatBox icon={<XCircle className="h-5 w-5 text-red-500" />} label="Wrong" value={wrong} />
              <StatBox icon={<MinusCircle className="h-5 w-5 text-muted-foreground" />} label="Skipped" value={skipped} />
            </div>
          </CardContent>
        </Card>

        {/* Subject-wise analysis */}
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1">
              <h2 className="font-semibold">Subject-wise accuracy</h2>
              <p className="text-sm text-muted-foreground">
                Correct answers ÷ all questions in each subject, including skipped questions. This is accuracy, not net marks; deductions are not applied here.
              </p>
            </div>
            <div className="space-y-3">
              {Array.from(subjects.entries()).map(([subject, s]) => {
                const pct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
                const barPercentage = Math.min(100, Math.max(0, pct));
                return (
                  <div key={subject} className="space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{subject}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {s.correct}/{s.total} correct · {pct}% accuracy
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-700",
                          pct >= 60 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500"
                        )}
                        style={{ width: `${barPercentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Answer review */}
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-2 font-semibold">Answer review</h2>
            <Accordion type="multiple" className="w-full">
              {review.map((q, i) => {
                const status = !q.user_answer ? "skipped" : q.user_answer === q.correct_answer ? "correct" : "wrong";
                return (
                  <AccordionItem key={q.id} value={q.id}>
                    <AccordionTrigger className="gap-3 text-left hover:no-underline">
                      <span className="flex min-w-0 flex-1 items-center gap-3">
                        {status === "correct" ? (
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                        ) : status === "wrong" ? (
                          <XCircle className="h-5 w-5 shrink-0 text-red-500" />
                        ) : (
                          <MinusCircle className="h-5 w-5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="min-w-0">
                          <span className="mr-2 text-muted-foreground">Q{i + 1}.</span>
                          <span className="line-clamp-2 text-sm font-normal sm:line-clamp-1">{q.question_text}</span>
                        </span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3 pl-8">
                        <p className="text-sm font-medium text-foreground">{q.question_text}</p>
                        <Badge variant="outline" className="text-xs">{q.subject}</Badge>
                        <div className="space-y-2">
                          {OPTION_KEYS.map((key) => {
                            const isCorrect = key === q.correct_answer;
                            const isUser = key === q.user_answer;
                            return (
                              <div
                                key={key}
                                className={cn(
                                  "flex items-start gap-2 rounded-lg border p-3 text-sm",
                                  isCorrect && "border-emerald-300 bg-emerald-50",
                                  isUser && !isCorrect && "border-red-300 bg-red-50",
                                  !isCorrect && !isUser && "border-border"
                                )}
                              >
                                <span className="font-semibold">{OPTION_LABELS[key]}.</span>
                                <span className="flex-1">{optionText(q, key)}</span>
                                {isCorrect && <Badge variant="success">Correct answer</Badge>}
                                {isUser && !isCorrect && <Badge variant="destructive">Your answer</Badge>}
                                {isUser && isCorrect && <Badge variant="success">Your answer</Badge>}
                              </div>
                            );
                          })}
                        </div>
                        {status === "skipped" && (
                          <p className="text-sm text-muted-foreground">You skipped this question.</p>
                        )}
                        {q.explanation && (
                          <div className="flex gap-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
                            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
                            <p>{q.explanation}</p>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </CardContent>
        </Card>

        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>
        </Button>
    </main>
  );
}

function StatBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border bg-background p-3">
      {icon}
      <span className="text-xl font-bold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}