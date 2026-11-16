"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { OtpInput } from "@/components/otp-input";
import { ResendCodeButton } from "@/components/resend-code-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { postAuth } from "@/lib/auth-client";

const STRONG_ENOUGH = /^(?=.*[A-Za-z])(?=.*[0-9]).{8,72}$/;

export function ChangePasswordForm() {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "sent">("idle");
  const [nonce, setNonce] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);

  function resetForm() {
    setStep("idle");
    setNonce("");
    setPassword("");
    setConfirm("");
  }

  async function sendCode() {
    setSending(true);
    try {
      await postAuth("/api/auth/change-password/start");
      toast.success("Verification code sent to your email");
      setStep("sent");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the verification code");
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (nonce.length < 6) {
      toast.error("Enter the code from your email");
      return;
    }
    if (!STRONG_ENOUGH.test(password)) {
      toast.error("Use at least 8 characters with a letter and a number");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await postAuth("/api/auth/change-password/finish", { nonce, password });
      toast.success("Password changed. Other devices were signed out.");
      resetForm();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change the password");
      setLoading(false);
      setNonce("");
    }
  }

  if (step === "idle") {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p>
            Changing your password requires a one-time code sent to your email — the same secure
            check used for login and password reset.
          </p>
        </div>
        <Button onClick={sendCode} size="lg" disabled={sending}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />}
          Email me a verification code
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="nonce">Verification code</Label>
        <OtpInput id="nonce" value={nonce} onChange={setNonce} disabled={loading} />
        <p className="text-xs text-muted-foreground">The code expires in 10 minutes.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          placeholder="Min. 8 characters, letter + number"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          placeholder="Re-enter new password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          required
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Change password
        </Button>
        <Button type="button" variant="ghost" onClick={resetForm} disabled={loading}>
          Cancel
        </Button>
      </div>
      <ResendCodeButton endpoint="/api/auth/change-password/start" />
    </form>
  );
}
