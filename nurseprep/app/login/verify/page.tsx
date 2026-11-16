import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginVerifyForm } from "@/components/login-verify-form";
import { readOtpCookie } from "@/lib/auth-cookies";

export const metadata: Metadata = { title: "Verify login" };

export default function LoginVerifyPage() {
  const pending = readOtpCookie("login");
  if (!pending) redirect("/login");
  return <LoginVerifyForm email={pending.email} />;
}
