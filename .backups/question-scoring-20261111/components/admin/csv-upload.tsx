"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { Exam } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CsvUpload({ exams }: { exams: Exam[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [examId, setExamId] = useState("shared");
  const [uploading, setUploading] = useState(false);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("Choose a CSV file first");

    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("exam_id", examId);

    try {
      const res = await fetch("/api/admin/questions", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Upload failed");
        return;
      }
      toast.success(
        `Uploaded ${data.inserted} question${data.inserted === 1 ? "" : "s"}` +
          (data.skipped > 0 ? ` · ${data.skipped} row(s) skipped` : "")
      );
      if (data.errors?.length) {
        toast.warning(`Row issues: ${data.errors.slice(0, 3).join("; ")}${data.errors.length > 3 ? "…" : ""}`);
      }
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch {
      toast.error("Network error during upload");
    } finally {
      setUploading(false);
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
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Add to exam</p>
            <Select value={examId} onValueChange={setExamId}>
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
            accept=".csv,text/csv"
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-4 file:py-2 file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-secondary/80"
          />
          <Button onClick={handleUpload} disabled={uploading} className="shrink-0">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}