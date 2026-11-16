import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { AdminQuestion, Exam } from "@/lib/types";
import { QuestionsManager } from "@/components/admin/questions-manager";
import { CsvUpload } from "@/components/admin/csv-upload";

export const metadata: Metadata = { title: "Manage Questions" };

export default async function AdminQuestionsPage() {
  const supabase = createClient();

  const { count } = await supabase
    .from("questions")
    .select("*", { count: "exact", head: true });

  const { data: questions } = await supabase
    .from("questions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<AdminQuestion[]>();

  const { data: exams } = await supabase
    .from("exams")
    .select("*")
    .order("name")
    .returns<Exam[]>();

  return (
    <div className="space-y-6">
      <CsvUpload exams={exams ?? []} />
      <QuestionsManager questions={questions ?? []} total={count ?? 0} exams={exams ?? []} />
    </div>
  );
}