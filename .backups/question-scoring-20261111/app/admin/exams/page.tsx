import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { Exam } from "@/lib/types";
import { ExamsManager } from "@/components/admin/exams-manager";

export const metadata: Metadata = { title: "Manage Exams" };

export default async function AdminExamsPage() {
  const supabase = createClient();
  const { data: exams } = await supabase
    .from("exams")
    .select("*")
    .order("category")
    .order("name")
    .returns<Exam[]>();

  return <ExamsManager exams={exams ?? []} />;
}