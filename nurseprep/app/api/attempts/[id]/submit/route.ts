import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DATABASE_UPDATE_MESSAGE, isDatabaseUpdateRequired } from "@/lib/database-status";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please login" }, { status: 401 });
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid attempt id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const answers = body?.answers;
  if (!body || Array.isArray(body) || typeof body !== "object" ||
      (answers !== null && answers !== undefined && (typeof answers !== "object" || Array.isArray(answers)))) {
    return NextResponse.json({ error: "Invalid answers" }, { status: 400 });
  }

  const { error } = await supabase.rpc("submit_attempt", {
    p_attempt_id: params.id,
    p_answers: answers ?? {},
  });

  if (error) {
    if (isDatabaseUpdateRequired(error)) {
      return NextResponse.json({ error: DATABASE_UPDATE_MESSAGE }, { status: 503 });
    }
    if (error.message.includes("ATTEMPT_NOT_FOUND")) {
      return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not submit the test" }, { status: 500 });
  }

  return NextResponse.json({ attempt_id: params.id });
}