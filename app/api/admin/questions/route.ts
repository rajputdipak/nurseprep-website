import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseQuestionCsv } from "@/lib/question-import";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const examIdRaw = form?.get("exam_id");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
  }
  if (file.size > 3 * 1024 * 1024) {
    return NextResponse.json({ error: "Each upload batch must be under 3 MB" }, { status: 413 });
  }
  if (typeof examIdRaw !== "string" || (examIdRaw !== "shared" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(examIdRaw))) {
    return NextResponse.json({ error: "Select an exam or the shared bank" }, { status: 400 });
  }
  const examId = examIdRaw === "shared" ? null : examIdRaw;
  if (examId) {
    const { data: exam } = await supabase.from("exams").select("id").eq("id", examId).single();
    if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 400 });
  }

  const { rows, errors } = parseQuestionCsv(await file.text());
  if (errors.length || !rows.length || rows.length > 500) {
    return NextResponse.json({
      error: rows.length > 500 ? "Use the admin uploader to send batches of up to 500 questions" : "Fix the CSV row errors before uploading",
      errors: errors.slice(0, 20), inserted: 0,
    }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("import_questions", { p_exam_id: examId, p_rows: rows });
  if (error) {
    console.error("[import_questions]", error.message);
    return NextResponse.json({ error: "Question import failed. Check that the question-bank database migration has been run; retrying the same file will skip duplicates." }, { status: 500 });
  }
  return NextResponse.json({ inserted: data.inserted, duplicates: data.duplicates });
}
