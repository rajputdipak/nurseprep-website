import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { readOtpCookie } from "@/lib/auth-cookies";

export const metadata: Metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  const pending = readOtpCookie("reset");
  if (!pending) redirect("/forgot-password");
  return <ResetPasswordForm email={pending.email} />;
}
