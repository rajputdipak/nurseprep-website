import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DATABASE_UPDATE_MESSAGE, isDatabaseUpdateRequired } from "@/lib/database-status";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please login to start a test" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const testId = body?.test_id;
  if (typeof testId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(testId)) {
    return NextResponse.json({ error: "Invalid test id" }, { status: 400 });
  }

  const { error: schemaError } = await supabase.from("tests").select("marks_per_correct, negative_marks").eq("id", testId).limit(1);
  if (schemaError) {
    console.error("[start_attempt]", schemaError.message);
    return NextResponse.json({ error: isDatabaseUpdateRequired(schemaError) ? DATABASE_UPDATE_MESSAGE : "Could not load test settings. Please retry." }, { status: 503 });
  }

  const { data, error } = await supabase.rpc("start_attempt", { p_test_id: testId });

  if (error) {
    if (isDatabaseUpdateRequired(error)) {
      return NextResponse.json({ error: DATABASE_UPDATE_MESSAGE }, { status: 503 });
    }
    if (error.message.includes("ACCESS_EXPIRED")) {
      return NextResponse.json({ error: "Your free access has ended. Choose a plan to continue practicing." }, { status: 402 });
    }
    if (error.message.includes("INSUFFICIENT_POOL")) {
      return NextResponse.json(
        { error: `Not enough unique unseen questions for this exam/subject. ${error.details ?? ""} Resume an existing attempt, choose another exam, or ask the admin to upload more questions to this exam or the shared bank.` },
        { status: 400 }
      );
    }
    if (error.message.includes("TEST_NOT_FOUND")) {
      return NextResponse.json({ error: "This test is no longer available" }, { status: 404 });
    }
    if (error.message.includes("INVALID_TEST_WEIGHTS")) {
      return NextResponse.json({ error: "This test's subject weights need to be corrected by an admin" }, { status: 400 });
    }
    console.error("[start_attempt]", error.message);
    return NextResponse.json({ error: "Could not start the test" }, { status: 500 });
  }

  return NextResponse.json({ attempt_id: data });
}