import QRCode from "qrcode";
import {
  checkPaymentDatabase, paymentRoute, PaymentApiError, readPaymentBody,
  requirePaymentUser, requireUuid, UPI_PATTERN,
} from "@/lib/payment-api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return paymentRoute(async () => {
    const { supabase, user } = await requirePaymentUser();
    const body = await readPaymentBody(request, ["plan_id"]);
    const planId = requireUuid(body.plan_id);
    const { data: paymentId, error } = await supabase.rpc("create_payment_request", { p_plan_id: planId });
    checkPaymentDatabase(error);
    const { data: payment, error: readError } = await supabase.from("payments")
      .select("id,user_id,plan_id,amount,method,utr,status,created_at,plan_name,duration_days,upi_id,payee_name,reviewed_at,reviewed_by,admin_note")
      .eq("id", paymentId).eq("user_id", user.id).single();
    checkPaymentDatabase(readError);
    if (!payment) throw new PaymentApiError(404, "Payment not found");
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000
      || typeof payment.upi_id !== "string" || !UPI_PATTERN.test(payment.upi_id)
      || typeof payment.payee_name !== "string" || !payment.payee_name.trim() || payment.payee_name.length > 100
      || typeof payment.plan_name !== "string" || !payment.plan_name.trim()
      || !Number.isInteger(payment.duration_days) || payment.duration_days <= 0) {
      throw new PaymentApiError(409, "Payment has no complete checkout snapshot");
    }
    const query = new URLSearchParams({
      pa: payment.upi_id, pn: payment.payee_name, am: amount.toFixed(2), cu: "INR",
      tn: `NursePrep ${payment.id}`,
    });
    const upiUri = `upi://pay?${query.toString()}`;
    const qrDataUrl = await QRCode.toDataURL(upiUri, { errorCorrectionLevel: "M", margin: 2, width: 320 });
    return { payment, upi_uri: upiUri, qr_data_url: qrDataUrl };
  });
}
