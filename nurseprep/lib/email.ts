import nodemailer, { type Transporter } from "nodemailer";

const EMAIL_PATTERN = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;

interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
}

function smtpSettings(): SmtpSettings | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const port = Number((process.env.SMTP_PORT ?? "465").trim());
  if (!host || !user || !pass || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE.trim() === "true" : port === 465;
  return { host, port, secure, auth: { user, pass } };
}

export function isEmailConfigured(): boolean {
  return smtpSettings() !== null;
}

export function normalizeRecipients(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const value of values) {
    const email = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (!email || !EMAIL_PATTERN.test(email) || seen.has(email)) continue;
    seen.add(email);
    recipients.push(email);
  }
  return recipients;
}

let transporter: Transporter | null = null;
let transportKey = "";

function getTransporter(settings: SmtpSettings): Transporter {
  const key = `${settings.host}:${settings.port}:${settings.auth.user}`;
  if (!transporter || transportKey !== key) {
    transporter = nodemailer.createTransport({
      ...settings,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    transportKey = key;
  }
  return transporter;
}

// Best effort: a failed email must never roll back a payment or review that already committed.
export async function sendEmail(input: {
  to: Array<string | null | undefined>;
  subject: string;
  text: string;
  html: string;
}): Promise<boolean> {
  const settings = smtpSettings();
  const to = normalizeRecipients(input.to);
  if (!settings || to.length === 0) {
    console.warn(`[email] skipped "${input.subject}" — ${settings ? "no valid recipients" : "SMTP is not configured"}`);
    return false;
  }
  const from = process.env.MAIL_FROM?.trim() || `NursePrep <${settings.auth.user}>`;
  try {
    await getTransporter(settings).sendMail({
      from,
      to,
      subject: input.subject.replace(/[\r\n]+/g, " "),
      text: input.text,
      html: input.html,
    });
    return true;
  } catch (error) {
    console.error(`[email] failed "${input.subject}":`, error instanceof Error ? error.message : "unknown error");
    return false;
  }
}
