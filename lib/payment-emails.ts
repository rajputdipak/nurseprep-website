import { formatPaymentAmount, formatPaymentDate } from "@/lib/payment-types";

export interface PaymentEmailPayment {
  id: string;
  plan_name: string | null;
  amount: number | string;
  duration_days: number | null;
  utr: string | null;
  created_at?: string | null;
}

export interface PaymentEmailStudent {
  full_name: string | null;
  email: string | null;
}

export interface PaymentAccessWindow {
  starts_at: string;
  ends_at: string;
}

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function planLabel(payment: PaymentEmailPayment): string {
  return payment.plan_name?.trim() || "NursePrep plan";
}

function studentName(student: PaymentEmailStudent): string {
  return student.full_name?.trim() || "Student";
}

function studentEmail(student: PaymentEmailStudent): string {
  return student.email?.trim() || "email unavailable";
}

function amountOf(payment: PaymentEmailPayment): string {
  const value = Number(payment.amount);
  return formatPaymentAmount(Number.isFinite(value) ? value : null);
}

function dateOnly(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "date unavailable";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
  });
}

function renderHtml(input: {
  heading: string;
  intro: string;
  rows: Array<[string, string]>;
  action?: { label: string; url: string };
  outro?: string;
}): string {
  const rows = input.rows
    .map(([label, value]) =>
      `<tr><td style="padding:6px 16px 6px 0;color:#64748b;font-size:14px;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td>` +
      `<td style="padding:6px 0;color:#0f172a;font-size:14px">${escapeHtml(value)}</td></tr>`)
    .join("");
  const action = input.action
    ? `<p style="margin:24px 0 8px"><a href="${escapeHtml(input.action.url)}" style="display:inline-block;background:#0f766e;color:#ffffff;padding:11px 20px;border-radius:8px;font-size:14px;text-decoration:none">${escapeHtml(input.action.label)}</a></p>` +
      `<p style="margin:0;color:#64748b;font-size:12px;word-break:break-all">${escapeHtml(input.action.url)}</p>`
    : "";
  const outro = input.outro
    ? `<p style="margin:20px 0 0;color:#334155;font-size:14px;line-height:1.6">${escapeHtml(input.outro)}</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif">` +
    `<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">` +
    `<p style="margin:0 0 4px;color:#0f766e;font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:bold">NursePrep</p>` +
    `<h1 style="margin:0 0 12px;color:#0f172a;font-size:20px">${escapeHtml(input.heading)}</h1>` +
    `<p style="margin:0 0 18px;color:#334155;font-size:14px;line-height:1.6">${escapeHtml(input.intro)}</p>` +
    `<table style="border-collapse:collapse;width:100%">${rows}</table>` +
    action + outro +
    `<p style="margin:28px 0 0;border-top:1px solid #e2e8f0;padding-top:14px;color:#94a3b8;font-size:12px">NursePrep — nursing exam practice platform</p>` +
    `</div></body></html>`;
}

export function buildAdminPaymentEmail(
  payment: PaymentEmailPayment,
  student: PaymentEmailStudent,
  siteUrl: string
): EmailContent {
  const amount = amountOf(payment);
  const plan = planLabel(payment);
  const name = studentName(student);
  const email = studentEmail(student);
  const duration = payment.duration_days ? ` — ${payment.duration_days} days` : "";
  const submitted = formatPaymentDate(payment.created_at);
  const reviewUrl = `${siteUrl}/admin/payments`;
  const subject = `New UPI payment submitted — ${amount} (${plan})`;
  const text = [
    "A student has submitted a UPI payment for verification.",
    "",
    `Student: ${name} (${email})`,
    `Plan: ${plan}${duration}`,
    `Amount: ${amount}`,
    `UTR: ${payment.utr ?? "not submitted"}`,
    `Payment ID: ${payment.id}`,
    `Submitted: ${submitted}`,
    "",
    "Check the bank/UPI statement, then approve or reject:",
    reviewUrl,
  ].join("\n");
  const html = renderHtml({
    heading: "New UPI payment submitted",
    intro: "A student has submitted a UPI payment. Verify the bank credit before approving access.",
    rows: [
      ["Student", `${name} (${email})`],
      ["Plan", `${plan}${duration}`],
      ["Amount", amount],
      ["UTR", payment.utr ?? "not submitted"],
      ["Payment ID", payment.id],
      ["Submitted", submitted],
    ],
    action: { label: "Review payment", url: reviewUrl },
    outro: "Approving activates paid access for the student and emails them a confirmation.",
  });
  return { subject, text, html };
}

export function buildStudentPaymentEmail(
  payment: PaymentEmailPayment,
  student: PaymentEmailStudent,
  decision: "verified" | "rejected",
  access: PaymentAccessWindow | null,
  siteUrl: string
): EmailContent {
  const amount = amountOf(payment);
  const plan = planLabel(payment);
  const name = studentName(student);
  const dashboardUrl = `${siteUrl}/dashboard`;
  const baseRows: Array<[string, string]> = [
    ["Plan", plan],
    ["Amount", amount],
    ["UTR", payment.utr ?? "not submitted"],
    ["Payment ID", payment.id],
  ];

  if (decision === "verified") {
    const window = access
      ? `${formatPaymentDate(access.starts_at)} – ${formatPaymentDate(access.ends_at)}`
      : "shown on your dashboard";
    const subject = access
      ? `Payment verified — access active till ${dateOnly(access.ends_at)}`
      : "Payment verified — paid access is active";
    const text = [
      `Hi ${name},`,
      "",
      "Your payment has been verified and paid access is now active.",
      "",
      `Plan: ${plan}`,
      `Amount: ${amount}`,
      `Access: ${window}`,
      `UTR: ${payment.utr ?? "not submitted"}`,
      "",
      `Start practising from your dashboard: ${dashboardUrl}`,
    ].join("\n");
    const html = renderHtml({
      heading: "Payment verified",
      intro: `Hi ${name}, your payment has been verified and paid access is now active.`,
      rows: [...baseRows, ["Access", window]],
      action: { label: "Open dashboard", url: dashboardUrl },
      outro: "You can now attempt any active exam, test and daily quiz.",
    });
    return { subject, text, html };
  }

  const subject = `Payment not verified — ${plan}`;
  const text = [
    `Hi ${name},`,
    "",
    `We could not verify this payment against our bank statement, so paid access was not activated.`,
    "",
    `Plan: ${plan}`,
    `Amount: ${amount}`,
    `UTR: ${payment.utr ?? "not submitted"}`,
    `Payment ID: ${payment.id}`,
    "",
    "If money was debited from your account, reply to this email with the bank reference or a payment screenshot.",
    "",
    `You can check your payment status here: ${siteUrl}/payments`,
  ].join("\n");
  const html = renderHtml({
    heading: "Payment could not be verified",
    intro: `Hi ${name}, we could not verify this payment against our bank statement, so paid access was not activated.`,
    rows: baseRows,
    action: { label: "View payment status", url: `${siteUrl}/payments` },
    outro: "If money was debited from your account, reply to this email with the bank reference or a payment screenshot.",
  });
  return { subject, text, html };
}
