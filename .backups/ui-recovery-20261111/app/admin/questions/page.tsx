import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { AdminQuestion, Exam } from "@/lib/types";
import { QuestionsManager } from "@/components/admin/questions-manager";
import { CsvUpload } from "@/components/admin/csv-upload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface BankStats { exam_id: string | null; total_count: number; unique_count: number }

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

  const { data: bankStats, error: statsError } = await supabase.rpc("get_question_bank_stats");

  return (
    <div className="space-y-6">
      <CsvUpload exams={exams ?? []} />
      <Card>
        <CardHeader><CardTitle className="text-lg">Uploaded bank coverage</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Tests draw from their own exam plus the shared bank, filtered by subject. Duplicate text is counted once in a test, and questions assigned in your earlier attempts are excluded—even if skipped.</p>
          {statsError ? (
            <p role="alert" className="text-sm text-destructive">Bank counts could not be loaded. Apply the question-bank database migration and refresh.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Bank</TableHead><TableHead>Uploaded rows</TableHead><TableHead>Unique question texts</TableHead></TableRow></TableHeader>
              <TableBody>
                {[{ id: null, name: "Shared bank (all exams)" }, ...(exams ?? [])].map((bank) => {
                  const stats = (bankStats as BankStats[] | null)?.find((row) => row.exam_id === bank.id);
                  return <TableRow key={bank.id ?? "shared"}><TableCell>{bank.name}</TableCell><TableCell>{Number(stats?.total_count ?? 0).toLocaleString()}</TableCell><TableCell>{Number(stats?.unique_count ?? 0).toLocaleString()}</TableCell></TableRow>;
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <QuestionsManager questions={questions ?? []} total={count ?? 0} exams={exams ?? []} />
    </div>
  );
}