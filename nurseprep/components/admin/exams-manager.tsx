"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Exam, ExamCategory, Test } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ExamForm {
  name: string;
  category: ExamCategory;
  description: string;
  is_active: boolean;
}

const EMPTY: ExamForm = { name: "", category: "central", description: "", is_active: true };

interface ExamsManagerProps {
  exams: Exam[];
  tests: Test[];
  testsLoadError: boolean;
}

export function ExamsManager({ exams, tests, testsLoadError }: ExamsManagerProps) {
  const router = useRouter();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [form, setForm] = useState<ExamForm>(EMPTY);
  const [deleting, setDeleting] = useState<Exam | null>(null);
  const [busy, setBusy] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setEditorOpen(true);
  }

  function openEdit(exam: Exam) {
    setEditing(exam);
    setForm({
      name: exam.name,
      category: exam.category,
      description: exam.description,
      is_active: exam.is_active,
    });
    setEditorOpen(true);
  }

  async function save() {
    if (!form.name.trim()) return toast.error("Exam name is required");
    setBusy(true);
    const supabase = createClient();
    const payload = {
      name: form.name.trim(),
      category: form.category,
      description: form.description.trim(),
      is_active: form.is_active,
    };
    const { error } = editing
      ? await supabase.from("exams").update(payload).eq("id", editing.id)
      : await supabase.from("exams").insert(payload);
    setBusy(false);
    if (error) {
      toast.error("Save failed: " + error.message);
      return;
    }
    toast.success(editing ? "Exam updated" : "Exam created");
    setEditorOpen(false);
    router.refresh();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("exams").delete().eq("id", deleting.id);
    setBusy(false);
    if (error) {
      toast.error("Delete failed: " + error.message);
      return;
    }
    toast.success("Exam deleted");
    setDeleting(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">Exams</CardTitle>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add exam
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {exams.map((exam) => (
              <TableRow key={exam.id}>
                <TableCell>
                  <p className="font-medium">{exam.name}</p>
                  <p className="line-clamp-1 text-xs text-muted-foreground">{exam.description}</p>
                </TableCell>
                <TableCell>
                  <Badge variant={exam.category === "central" ? "default" : "secondary"}>
                    {exam.category === "central" ? "Central" : "State"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={exam.is_active ? "success" : "warning"}>
                    {exam.is_active ? "Active" : "Hidden"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(exam)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleting(exam)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {/* Create / edit */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit exam" : "Add exam"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update exam details." : "New exams appear on the dashboard once active."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. DSSSB Nursing Officer" />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as ExamCategory }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="central">Central</SelectItem>
                  <SelectItem value="state">State</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Short description" />
            </div>
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select value={form.is_active ? "active" : "hidden"} onValueChange={(v) => setForm((f) => ({ ...f, is_active: v === "active" }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active — visible to users</SelectItem>
                  <SelectItem value="hidden">Hidden</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Create exam"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>
              This also deletes its tests, exam-specific questions and all user attempts for those tests. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete exam
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
    <TestScoringEditor exams={exams} tests={tests} testsLoadError={testsLoadError} />
    </div>
  );
}

function TestScoringEditor({ exams, tests, testsLoadError }: ExamsManagerProps) {
  const router = useRouter();
  const [testId, setTestId] = useState("");
  const [marksPerCorrect, setMarksPerCorrect] = useState("");
  const [negativeMarks, setNegativeMarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const selectedTest = tests.find((test) => test.id === testId);
  const busy = saving || refreshing;
  const correctValue = Number(marksPerCorrect);
  const negativeValue = Number(negativeMarks);
  const decimalPattern = /^(?:\d+(?:\.\d{0,4})?|\.\d{1,4})$/;
  const correctValid = decimalPattern.test(marksPerCorrect) && Number.isFinite(correctValue) && correctValue > 0 && correctValue <= 100;
  const negativeValid = decimalPattern.test(negativeMarks) && Number.isFinite(negativeValue) && negativeValue >= 0 && negativeValue <= 100;

  function chooseTest(id: string) {
    const test = tests.find((item) => item.id === id);
    setTestId(id);
    setMarksPerCorrect(test ? String(test.marks_per_correct) : "");
    setNegativeMarks(test ? String(test.negative_marks) : "");
  }

  async function saveScoring(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || testsLoadError) return;
    if (!selectedTest) return toast.error("Choose a test first");
    if (!correctValid || !negativeValid) {
      toast.error("Use up to 4 decimal places: correct marks must be greater than 0 and at most 100; deductions must be 0 to 100.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("tests")
        .update({ marks_per_correct: correctValue, negative_marks: negativeValue })
        .eq("id", selectedTest.id)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("No test was updated");
      toast.success("Marking scheme saved for new attempts");
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error("Save failed: " + (error instanceof Error ? error.message : "Please try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="text-lg">Test marking scheme</CardTitle>
        <p className="text-sm text-muted-foreground">
          Practice defaults: +1 correct / -0.25 wrong / 0 skipped. Match each test to its official paper&apos;s marking scheme; exams may use different rules.
        </p>
      </CardHeader>
      <CardContent>
        {testsLoadError ? (
          <p role="alert" className="text-sm text-destructive">Could not load tests. Refresh this page to try again.</p>
        ) : tests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tests are available to configure.</p>
        ) : (
          <form onSubmit={saveScoring} noValidate className="space-y-4" aria-busy={busy}>
            <div className="space-y-2">
              <Label htmlFor="scoring-test">Choose test</Label>
              <Select value={testId} onValueChange={chooseTest} disabled={busy}>
                <SelectTrigger id="scoring-test">
                  <SelectValue placeholder="Select a test" />
                </SelectTrigger>
                <SelectContent>
                  {tests.map((test) => (
                    <SelectItem key={test.id} value={test.id}>
                      {exams.find((exam) => exam.id === test.exam_id)?.name ?? "Exam"} — {test.name}{test.is_active ? "" : " (hidden)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="marks-per-correct">Marks per correct answer</Label>
                <Input
                  id="marks-per-correct"
                  type="number"
                  inputMode="decimal"
                  min="0.0001"
                  max="100"
                  step="0.0001"
                  required
                  value={marksPerCorrect}
                  onChange={(event) => setMarksPerCorrect(event.target.value)}
                  disabled={busy || !selectedTest}
                  aria-describedby="correct-marks-help"
                  aria-invalid={Boolean(selectedTest) && !correctValid}
                />
                <p id="correct-marks-help" className="text-xs text-muted-foreground">
                  Greater than 0, up to 100. Maximum 4 decimal places.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="negative-marks">Deduction per wrong answer</Label>
                <Input
                  id="negative-marks"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="100"
                  step="0.0001"
                  required
                  value={negativeMarks}
                  onChange={(event) => setNegativeMarks(event.target.value)}
                  disabled={busy || !selectedTest}
                  aria-describedby="negative-marks-help"
                  aria-invalid={Boolean(selectedTest) && !negativeValid}
                />
                <p id="negative-marks-help" className="text-xs text-muted-foreground">
                  Enter 0 to 100, not a negative number. Maximum 4 decimal places; 0 means no deduction.
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Skipped answers earn 0 marks. Changes apply only to new attempts; existing attempts keep their saved scheme, including historical attempts with no negative marking.
            </p>
            {selectedTest && (!correctValid || !negativeValid) && (
              <p role="alert" className="text-sm text-destructive">Enter valid marks within the limits above before saving.</p>
            )}
            <Button type="submit" disabled={busy || !selectedTest || !correctValid || !negativeValid}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {busy ? "Saving…" : "Save marking scheme"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}