"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Clock, Eraser, Grid3X3, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { OPTION_LABELS, optionText, type AttemptQuestion, type OptionKey } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const OPTION_KEYS: OptionKey[] = ["a", "b", "c", "d"];

interface Props {
  attemptId: string;
  testName: string;
  durationMinutes: number;
  startedAt: string;
  initialAnswers: Record<string, OptionKey>;
  questions: AttemptQuestion[];
}

export function TestEngine({ attemptId, testName, durationMinutes, startedAt, initialAnswers, questions }: Props) {
  const router = useRouter();
  const storageKey = `nurseprep:attempt:${attemptId}`;
  const deadline = new Date(startedAt).getTime() + durationMinutes * 60000;

  const [answers, setAnswers] = useState<Record<string, OptionKey>>(initialAnswers);
  const [index, setIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const answersRef = useRef(answers);
  const submittedRef = useRef(false);
  answersRef.current = answers;

  // Resume from localStorage on refresh
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.answers && typeof saved.answers === "object") {
          setAnswers((prev) => ({ ...prev, ...saved.answers }));
        }
        if (typeof saved.index === "number" && saved.index >= 0 && saved.index < questions.length) {
          setIndex(saved.index);
        }
      }
    } catch {
      // corrupted storage — start from server state
    }
  }, [storageKey, questions.length]);

  // Persist locally + sync answers to server (debounced)
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ answers, index }));
    } catch {
      // storage full/blocked — server sync still runs
    }
    const t = setTimeout(() => {
      const supabase = createClient();
      supabase
        .from("user_attempts")
        .update({ answers })
        .eq("id", attemptId)
        .then(({ error }) => {
          if (error) console.error("Answer sync failed", error.message);
        });
    }, 800);
    return () => clearTimeout(t);
  }, [answers, index, attemptId]);

  const submit = useCallback(
    async (auto = false) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      setDialogOpen(false);
      try {
        const res = await fetch(`/api/attempts/${attemptId}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: answersRef.current }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Submit failed");
        }
        try {
          localStorage.removeItem(storageKey);
        } catch {}
        toast.success(auto ? "Time up — test submitted" : "Test submitted");
        router.replace(`/result/${attemptId}`);
        router.refresh();
      } catch (e) {
        submittedRef.current = false;
        setSubmitting(false);
        toast.error(e instanceof Error ? e.message : "Could not submit. Please try again.");
      }
    },
    [attemptId, router, storageKey]
  );

  // Countdown with auto-submit
  useEffect(() => {
    const t = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        clearInterval(t);
        submit(true);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [deadline, submit]);

  const question = questions[index];
  const answeredCount = Object.keys(answers).filter((k) => answers[k]).length;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  function selectOption(key: OptionKey) {
    setAnswers((prev) => ({ ...prev, [question.id]: key }));
  }

  function clearResponse() {
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[question.id];
      return next;
    });
  }

  if (!question) return null;

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b bg-white">
        <div className="container flex h-14 items-center justify-between gap-3">
          <h1 className="min-w-0 truncate text-sm font-semibold sm:text-base">{testName}</h1>
          <div className="flex shrink-0 items-center gap-2">
            <Badge
              variant={secondsLeft < 60 ? "destructive" : "secondary"}
              className={cn("px-3 py-1 font-mono text-sm tabular-nums", secondsLeft < 60 && "animate-pulse")}
            >
              <Clock className="mr-1 h-3.5 w-3.5" />
              {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
            </Badge>
            <Button size="sm" onClick={() => setDialogOpen(true)} disabled={submitting}>
              Submit
            </Button>
          </div>
        </div>
      </header>

      <main className="container flex flex-1 gap-6 py-6">
        {/* Question area */}
        <div className="min-w-0 flex-1 space-y-4">
          <Card>
            <CardContent className="space-y-5 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Question {index + 1} <span className="text-muted-foreground/60">of {questions.length}</span>
                </span>
                <Badge variant="outline">{question.subject}</Badge>
              </div>
              <p className="text-base font-medium leading-relaxed sm:text-lg">{question.question_text}</p>
              <div className="space-y-3">
                {OPTION_KEYS.map((key) => {
                  const selected = answers[question.id] === key;
                  return (
                    <button
                      key={key}
                      onClick={() => selectOption(key)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-xl border p-4 text-left text-sm transition-all sm:text-base",
                        selected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-input bg-background hover:border-primary/40 hover:bg-accent"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          selected ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                        )}
                      >
                        {OPTION_LABELS[key]}
                      </span>
                      <span className="pt-0.5">{optionText(question, key)}</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={clearResponse} disabled={!answers[question.id]} className="text-muted-foreground">
              <Eraser className="h-4 w-4" /> Clear
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
                <ChevronLeft className="h-4 w-4" /> Prev
              </Button>
              <Button onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))} disabled={index === questions.length - 1}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Mobile palette toggle */}
          <Button variant="outline" className="w-full lg:hidden" onClick={() => setPaletteOpen((v) => !v)}>
            <Grid3X3 className="h-4 w-4" />
            {paletteOpen ? "Hide" : "Show"} question palette ({answeredCount}/{questions.length} answered)
          </Button>
          {paletteOpen && (
            <Card className="lg:hidden">
              <CardContent className="p-4">
                <Palette
                  questions={questions}
                  answers={answers}
                  index={index}
                  onSelect={(i) => {
                    setIndex(i);
                    setPaletteOpen(false);
                  }}
                />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Desktop palette */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <Card className="sticky top-20">
            <CardContent className="space-y-4 p-4">
              <p className="text-sm font-semibold">
                Question palette
                <span className="ml-1 font-normal text-muted-foreground">
                  ({answeredCount}/{questions.length})
                </span>
              </p>
              <Palette questions={questions} answers={answers} index={index} onSelect={setIndex} />
              <div className="space-y-1.5 border-t pt-3 text-xs text-muted-foreground">
                <p className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded bg-emerald-500" /> Answered
                </p>
                <p className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded bg-secondary ring-1 ring-border" /> Not answered
                </p>
                <p className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded ring-2 ring-primary" /> Current
                </p>
              </div>
            </CardContent>
          </Card>
        </aside>
      </main>

      {/* Submit confirmation */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit test?</DialogTitle>
            <DialogDescription>
              You have answered {answeredCount} of {questions.length} questions.
              {answeredCount < questions.length &&
                ` ${questions.length - answeredCount} question${questions.length - answeredCount === 1 ? "" : "s"} will be marked skipped.`}{" "}
              You cannot change answers after submitting.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Keep practicing
            </Button>
            <Button onClick={() => submit(false)} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Yes, submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Palette({
  questions,
  answers,
  index,
  onSelect,
}: {
  questions: AttemptQuestion[];
  answers: Record<string, OptionKey>;
  index: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-5">
      {questions.map((q, i) => (
        <button
          key={q.id}
          onClick={() => onSelect(i)}
          className={cn(
            "flex h-9 w-full items-center justify-center rounded-lg text-xs font-medium transition-colors",
            answers[q.id]
              ? "bg-emerald-500 text-white hover:bg-emerald-600"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/70",
            i === index && "ring-2 ring-primary ring-offset-1"
          )}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
}