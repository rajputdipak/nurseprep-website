import Link from "next/link";
import { ArrowRight, BookOpenCheck, ClipboardList, Timer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Exam } from "@/lib/types";
import { SiteHeader } from "@/components/site-header";
import { ExamCard } from "@/components/exam-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const FEATURES = [
  {
    icon: BookOpenCheck,
    title: "Exam-focused question bank",
    description:
      "NORCET, AIIMS, ESIC, RRB and state exams — full mocks, subject tests, daily quizzes and previous year questions.",
  },
  {
    icon: Timer,
    title: "Real exam environment",
    description:
      "Timed tests with question palette, just like the real computer-based exam. Auto-submit when time runs out.",
  },
  {
    icon: ClipboardList,
    title: "Detailed answer review",
    description:
      "Every question explained. Subject-wise analysis shows exactly where you stand and what to improve.",
  },
];

const FAQS = [
  {
    q: "Is the 7-day free trial really free?",
    a: "Yes. Register with your Gmail and get 7 days of full access — all exams, all test categories, no payment details needed.",
  },
  {
    q: "Which exams are covered?",
    a: "Central exams like NORCET (AIIMS), ESIC, RRB and MNS, plus state nursing exams for UP, Maharashtra, Bihar, Rajasthan and more being added.",
  },
  {
    q: "Who can join — BSc, ANM or GNM?",
    a: "All three. The question bank covers the common nursing syllabus tested across staff nurse and nursing officer recruitment exams.",
  },
  {
    q: "How are test questions selected?",
    a: "Questions are generated randomly with subject weightage matching the exam pattern. A question once assigned to you in any earlier test — even if you skipped it or left the test incomplete — is never given again, so you always get fresh practice.",
  },
  {
    q: "Can I review my answers after a test?",
    a: "Yes. After submitting, you get your score, subject-wise analysis, and every question with the correct answer and a detailed explanation.",
  },
];

const PREVIEW_EXAMS: Exam[] = [
  { id: "preview-1", name: "NORCET (AIIMS)", category: "central", description: "Nursing Officer Recruitment Common Eligibility Test.", is_active: true, created_at: "" },
  { id: "preview-2", name: "ESIC Staff Nurse", category: "central", description: "Employees State Insurance Corporation nursing exam.", is_active: true, created_at: "" },
  { id: "preview-3", name: "RRB Staff Nurse", category: "central", description: "Railway Recruitment Board nursing exam.", is_active: true, created_at: "" },
  { id: "preview-4", name: "UP PSC Staff Nurse", category: "state", description: "Uttar Pradesh staff nurse recruitment.", is_active: true, created_at: "" },
  { id: "preview-5", name: "Maharashtra Staff Nurse", category: "state", description: "Maharashtra state nursing recruitment.", is_active: true, created_at: "" },
  { id: "preview-6", name: "Bihar Staff Nurse", category: "state", description: "Bihar BTSC staff nurse recruitment.", is_active: true, created_at: "" },
];

export default async function LandingPage() {
  let exams: Exam[] = PREVIEW_EXAMS;

  if (isSupabaseConfigured()) {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("exams")
        .select("*")
        .eq("is_active", true)
        .order("category")
        .order("name")
        .limit(6)
        .returns<Exam[]>();
      if (data && data.length > 0) exams = data;
    } catch {
      // fall back to preview list before Supabase is configured
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* Hero */}
      <section className="container flex flex-col items-center gap-6 pb-16 pt-20 text-center sm:pt-28">
        <Badge variant="secondary" className="animate-fade-up px-3 py-1 text-sm">
          For BSc · ANM · GNM students
        </Badge>
        <h1 className="max-w-3xl animate-fade-up text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl" style={{ animationDelay: "60ms" }}>
          Nursing exam practice —{" "}
          <span className="text-primary">7 days FREE</span>
        </h1>
        <p className="max-w-xl animate-fade-up text-lg text-muted-foreground" style={{ animationDelay: "120ms" }}>
          Mock tests, daily quizzes and previous year questions for central and
          state nursing exams. Practice like it&apos;s the real exam.
        </p>
        <div className="animate-fade-up" style={{ animationDelay: "180ms" }}>
          <Button size="lg" asChild className="px-10 text-base">
            <Link href="/register">
              Register Now <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="border-y bg-muted/40 py-16">
        <div className="container">
          <h2 className="text-center text-2xl font-semibold sm:text-3xl">Everything you need to clear the exam</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title} className="border-none shadow-sm">
                <CardContent className="space-y-3 p-6">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <f.icon className="h-5 w-5" />
                  </span>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{f.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Exam preview */}
      <section className="container py-16">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold sm:text-3xl">Exams you can practice</h2>
            <p className="mt-1 text-muted-foreground">Central and state recruitment exams</p>
          </div>
          <Button variant="outline" asChild className="hidden sm:inline-flex">
            <Link href="/register">See all exams</Link>
          </Button>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {exams.map((exam) =>
            exam.id.startsWith("preview-") ? (
              <div key={exam.id} className="pointer-events-none">
                <ExamCard exam={exam} />
              </div>
            ) : (
              <ExamCard key={exam.id} exam={exam} />
            )
          )}
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t bg-muted/40 py-16">
        <div className="container max-w-2xl">
          <h2 className="text-center text-2xl font-semibold sm:text-3xl">Frequently asked questions</h2>
          <Accordion type="single" collapsible className="mt-8">
            {FAQS.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-base">{faq.q}</AccordionTrigger>
                <AccordionContent className="text-base leading-relaxed">{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA */}
      <section className="container py-20 text-center">
        <h2 className="text-2xl font-semibold sm:text-3xl">Start practicing today</h2>
        <p className="mt-2 text-muted-foreground">7 days free. No card required.</p>
        <Button size="lg" asChild className="mt-6 px-10 text-base">
          <Link href="/register">
            Register Now <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </section>

      <footer className="border-t py-6">
        <div className="container text-center text-sm text-muted-foreground">
          NursePrep — nursing exam practice platform
        </div>
      </footer>
    </div>
  );
}