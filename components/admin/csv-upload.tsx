"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
import { IMPORT_BATCH_SIZE, parseQuestionCsv } from "@/lib/question-import";
import type { Exam } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CsvUpload({ exams }: { exams: Exam[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [examId, setExamId] = useState("shared");
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState("");

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("Choose a CSV file first");
    if (file.size > 20 * 1024 * 1024) return toast.error("Choose a CSV under 20 MB");

    setUploading(true);
    setSummary("Validating all rows before upload…");
    let inserted = 0;
    let duplicates = 0;
    let processed = 0;
    const destination = examId === "shared" ? "Shared bank" : exams.find((exam) => exam.id === examId)?.name;
    try {
      const { rows, errors } = parseQuestionCsv(await file.text());
      if (errors.length) throw new Error(errors.slice(0, 5).join("; "));
      const batches: Blob[] = [];
      for (let offset = 0; offset < rows.length; offset += IMPORT_BATCH_SIZE) {
        const batch = new Blob([Papa.unparse(rows.slice(offset, offset + IMPORT_BATCH_SIZE))], { type: "text/csv" });
        if (batch.size > 3 * 1024 * 1024) throw new Error("Some questions are too large for an upload batch. Split the file into smaller files.");
        batches.push(batch);
      }
      for (let index = 0; index < batches.length; index++) {
        const batch = batches[index];
        const form = new FormData();
        form.append("file", batch, "questions.csv");
        form.append("exam_id", examId);
        const res = await fetch("/api/admin/questions", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.errors?.slice(0, 3).join("; ") || data.error || "Upload failed");
        inserted += data.inserted;
        duplicates += data.duplicates;
        processed = Math.min((index + 1) * IMPORT_BATCH_SIZE, rows.length);
        setSummary(`${processed.toLocaleString()}/${rows.length.toLocaleString()} processed · ${inserted.toLocaleString()} added · ${duplicates.toLocaleString()} duplicates skipped`);
      }
      setSummary(`${destination}: ${inserted.toLocaleString()} questions added · ${duplicates.toLocaleString()} duplicate rows skipped. Existing questions were not deleted.`);
      toast.success(`Added ${inserted.toLocaleString()} questions to ${destination}`);
      if (fileRef.current) fileRef.current.value = "";
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Network error during upload";
      setSummary(`Upload stopped: ${reason}. ${processed.toLocaleString()} rows confirmed processed, ${inserted.toLocaleString()} added, ${duplicates.toLocaleString()} duplicates skipped. After fixing the issue, retry the same file; already imported questions will be skipped.`);
      toast.error("Upload stopped — see the details below");
    } finally {
      setUploading(false);
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Upload questions (CSV)</CardTitle>
        <CardDescription>
          Columns: subject, question, option_a, option_b, option_c, option_d, correct_answer (a/b/c/d), explanation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Upload up to 10,000 rows per file. Questions added to a specific exam appear only in that exam; use the shared bank for all exams. Matching question text is treated as a duplicate.</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Add to exam</p>
            <Select value={examId} onValueChange={setExamId} disabled={uploading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shared">Shared bank (all exams)</SelectItem>
                {exams.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" asChild>
              <a href="/sample-questions.csv" download>
                <Download className="h-4 w-4" /> Sample CSV
              </a>
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            ref={fileRef}
            type="file"
            aria-label="Question CSV file"
            disabled={uploading}
            accept=".csv,text/csv"
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-4 file:py-2 file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-secondary/80"
          />
          <Button onClick={handleUpload} disabled={uploading} className="shrink-0">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload
          </Button>
        </div>
        {summary && <p role="status" className="rounded-lg bg-muted p-3 text-sm">{summary}</p>}
      </CardContent>
    </Card>
  );
}