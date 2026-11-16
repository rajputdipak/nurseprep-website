import {
  checkPaymentDatabase, paymentRoute, PaymentApiError, readPaymentBody,
  requirePaymentPlatform, requirePaymentUser, requireText, UPI_PATTERN,
} from "@/lib/payment-api";

export async function POST(request: Request) {
  return paymentRoute(async () => {
    const { supabase } = await requirePaymentUser(true);
    const body = await readPaymentBody(request, ["upi_id", "payee_name", "is_enabled"]);
    const upiId = requireText(body.upi_id, "UPI id", 165, true);
    const payeeName = requireText(body.payee_name, "payee name", 100, true);
    if (typeof body.is_enabled !== "boolean" || (upiId !== "" && !UPI_PATTERN.test(upiId))
      || (body.is_enabled && (!upiId || !payeeName))) {
      throw new PaymentApiError(400, "Valid UPI id and payee name are required to enable payments");
    }
    await requirePaymentPlatform(supabase);
    const { data, error } = await supabase.from("payment_settings").upsert({
      id: 1, upi_id: upiId, payee_name: payeeName, is_enabled: body.is_enabled,
    }, { onConflict: "id" }).select("id,upi_id,payee_name,is_enabled").single();
    checkPaymentDatabase(error);
    return { payment_settings: data };
  });
}
