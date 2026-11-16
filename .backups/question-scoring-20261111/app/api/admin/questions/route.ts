import { NextResponse } from "next/server";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/server";

const REQUIRED = ["subject", "question", "option_a", "option_b", "option_c", "option_d", "correct_answer"];

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const examIdRaw = form?.get("exam_id");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
  }
  const examId = examIdRaw && examIdRaw !== "shared" ? String(examIdRaw) : null;

  if (examId) {
    const { data: exam } = await supabase.from("exams").select("id").eq("id", examId).single();
    if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 400 });
  }

  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  if (parsed.meta.fields === undefined || !REQUIRED.every((f) => parsed.meta.fields!.includes(f))) {
    return NextResponse.json(
      { error: `CSV must have columns: ${REQUIRED.join(", ")} (explanation optional)` },
      { status: 400 }
    );
  }

  const rows: {
    exam_id: string | null;
    subject: string;
    question_text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_answer: string;
    explanation: string;
  }[] = [];
  const errors: string[] = [];

  parsed.data.forEach((row, i) => {
    const clean = Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k, (v ?? "").trim()])
    );
    const missing = REQUIRED.filter((f) => !clean[f]);
    if (missing.length) {
      errors.push(`Row ${i + 2}: missing ${missing.join(", ")}`);
      return;
    }
    if (!["a", "b", "c", "d"].includes(clean.correct_answer.toLowerCase())) {
      errors.push(`Row ${i + 2}: correct_answer must be a/b/c/d`);
      return;
    }
    rows.push({
      exam_id: examId,
      subject: clean.subject,
      question_text: clean.question,
      option_a: clean.option_a,
      option_b: clean.option_b,
      option_c: clean.option_c,
      option_d: clean.option_d,
      correct_answer: clean.correct_answer.toLowerCase(),
      explanation: clean.explanation ?? "",
    });
  });

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No valid rows found", errors, inserted: 0, skipped: parsed.data.length },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("questions").insert(rows);
  if (error) {
    return NextResponse.json({ error: "Database insert failed: " + error.message }, { status: 500 });
  }

  return NextResponse.json({
    inserted: rows.length,
    skipped: parsed.data.length - rows.length,
    errors,
  });
}