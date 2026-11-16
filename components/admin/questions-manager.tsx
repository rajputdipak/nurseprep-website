"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { AdminQuestion, Exam } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function QuestionsManager({
  questions,
  total,
  exams,
}: {
  questions: AdminQuestion[];
  total: number;
  exams: Exam[];
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<AdminQuestion | null>(null);
  const [busy, setBusy] = useState(false);

  const examName = (id: string | null) =>
    id ? exams.find((e) => e.id === id)?.name ?? "Unknown exam" : "Shared bank";

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("questions").delete().eq("id", deleting.id);
    setBusy(false);
    if (error) {
      toast.error("Delete failed: " + error.message);
      return;
    }
    toast.success("Question deleted");
    setDeleting(null);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">Question bank</CardTitle>
        <Badge variant="secondary">{total} total · showing latest {questions.length}</Badge>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[280px]">Question</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Exam</TableHead>
              <TableHead>Answer</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {questions.map((q) => (
              <TableRow key={q.id}>
                <TableCell className="max-w-md">
                  <p className="line-clamp-2 text-sm">{q.question_text}</p>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{q.subject}</TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{examName(q.exam_id)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="uppercase">{q.correct_answer}</Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleting(q)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {questions.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No questions yet. Upload a CSV above.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this question?</DialogTitle>
            <DialogDescription className="line-clamp-3">
              {deleting?.question_text}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}