import {
  checkPaymentDatabase, paymentRoute, PaymentApiError, readPaymentBody,
  requirePaymentUser, requireText, requireUuid,
} from "@/lib/payment-api";
import { notifyStudentOfPaymentReview } from "@/lib/payment-notifications";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  return paymentRoute(async () => {
    const { supabase } = await requirePaymentUser(true);
    const paymentId = requireUuid(params.id);
    const body = await readPaymentBody(request, ["decision", "note", "confirm_received"]);
    if (body.decision !== "verified" && body.decision !== "rejected") {
      throw new PaymentApiError(400, "Decision must be verified or rejected");
    }
    if (body.confirm_received !== undefined && typeof body.confirm_received !== "boolean") {
      throw new PaymentApiError(400, "Invalid receipt confirmation");
    }
    if (body.decision === "verified" && body.confirm_received !== true) {
      throw new PaymentApiError(400, "Confirm that the money was received before approving");
    }
    const note = requireText(body.note === undefined ? "" : body.note, "note", 500, true);
    const { data, error } = await supabase.rpc("review_payment", {
      p_payment_id: paymentId, p_decision: body.decision, p_note: note,
    });
    checkPaymentDatabase(error);

    const { data: payment } = await supabase.from("payments")
      .select("id,user_id,plan_name,amount,duration_days,utr,created_at")
      .eq("id", paymentId).maybeSingle();
    if (payment) {
      const [{ data: student }, accessResult] = await Promise.all([
        supabase.from("profiles").select("full_name,email").eq("id", payment.user_id).maybeSingle(),
        body.decision === "verified"
          ? supabase.from("user_plans").select("starts_at,ends_at").eq("payment_id", paymentId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      await notifyStudentOfPaymentReview(
        payment, student ?? { full_name: null, email: null }, body.decision, accessResult.data
      );
    }

    return { payment_id: data };
  });
}
