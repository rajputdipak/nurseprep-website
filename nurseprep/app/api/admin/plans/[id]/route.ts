import {
  checkPaymentDatabase, paymentRoute, PaymentApiError, readPaymentBody,
  requirePaymentPlatform, requirePaymentUser, requireUuid,
} from "@/lib/payment-api";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  return paymentRoute(async () => {
    const { supabase } = await requirePaymentUser(true);
    const planId = requireUuid(params.id);
    const body = await readPaymentBody(request, ["price", "duration_days", "is_active"]);
    if (typeof body.price !== "number" || !Number.isFinite(body.price) || body.price < 0 || body.price > 100000
      || !/^\d+(\.\d{1,2})?$/.test(String(body.price))) {
      throw new PaymentApiError(400, "Price must be 0–100000 with at most two decimal places");
    }
    if (typeof body.duration_days !== "number" || !Number.isInteger(body.duration_days)
      || body.duration_days < 1 || body.duration_days > 3650 || typeof body.is_active !== "boolean") {
      throw new PaymentApiError(400, "Duration must be 1–3650 whole days and is_active must be boolean");
    }
    await requirePaymentPlatform(supabase);
    const { data, error } = await supabase.from("plans").update({
      price: body.price, duration_days: body.duration_days, is_active: body.is_active,
    }).eq("id", planId).select("id,name,price,duration_days,features,is_active").maybeSingle();
    checkPaymentDatabase(error);
    if (!data) throw new PaymentApiError(404, "Plan not found");
    return { plan: data };
  });
}
