"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Exam, ExamCategory } from "@/lib/types";
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

export function ExamsManager({ exams }: { exams: Exam[] }) {
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
  );
}