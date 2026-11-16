import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const body = await request.json().catch(() => null);
  const answers = body?.answers;
  if (answers !== null && answers !== undefined && typeof answers !== "object") {
    return NextResponse.json({ error: "Invalid answers" }, { status: 400 });
  }

  const { error } = await supabase.rpc("submit_attempt", {
    p_attempt_id: params.id,
    p_answers: answers ?? {},
  });

  if (error) {
    if (error.message.includes("ATTEMPT_NOT_FOUND")) {
      return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not submit the test" }, { status: 500 });
  }

  return NextResponse.json({ attempt_id: params.id });
}