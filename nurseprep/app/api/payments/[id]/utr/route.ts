import {
  checkPaymentDatabase, paymentRoute, PaymentApiError, readPaymentBody,
  requirePaymentUser, requireText, requireUuid,
} from "@/lib/payment-api";
import { notifyAdminsOfPaymentSubmitted } from "@/lib/payment-notifications";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  return paymentRoute(async () => {
    const { supabase, user } = await requirePaymentUser();
    const paymentId = requireUuid(params.id);
    const body = await readPaymentBody(request, ["utr"]);
    const utr = requireText(body.utr, "UTR", 64);
    if (!/^[0-9]{12}$/.test(utr)) throw new PaymentApiError(400, "UTR must contain exactly 12 digits");
    const { data, error } = await supabase.rpc("submit_payment_utr", { p_payment_id: paymentId, p_utr: utr });
    checkPaymentDatabase(error);

    const [{ data: payment }, { data: profile }] = await Promise.all([
      supabase.from("payments")
        .select("id,plan_name,amount,duration_days,utr,created_at")
        .eq("id", paymentId).maybeSingle(),
      supabase.from("profiles").select("full_name,email").eq("id", user.id).maybeSingle(),
    ]);
    if (payment) await notifyAdminsOfPaymentSubmitted(payment, profile ?? { full_name: null, email: null });

    return { payment_id: data };
  });
}
