"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { OtpInput } from "@/components/otp-input";
import { ResendCodeButton } from "@/components/resend-code-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { postAuth } from "@/lib/auth-client";

export function LoginVerifyForm({ email }: { email: string }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (token.length < 6) {
      toast.error("Enter the code from your email");
      return;
    }
    setLoading(true);
    try {
      const data = await postAuth("/api/auth/verify", { token });
      const next = typeof data.next === "string" && data.next.startsWith("/") ? data.next : "/dashboard";
      toast.success("Verified — welcome back!");
      router.push(next);
      router.refresh();
    } catch (error) {
      setLoading(false);
      setToken("");
      toast.error(error instanceof Error ? error.message : "Could not verify the code");
    }
  }

  return (
    <main className="container flex min-h-screen items-center justify-center py-10">
      <Card className="w-full max-w-md animate-fade-up">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl">Enter your login code</CardTitle>
          <CardDescription>
            We emailed a one-time code to <span className="font-medium text-foreground">{email}</span>.
            It expires in 10 minutes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="otp">Login code</Label>
              <OtpInput id="otp" value={token} onChange={setToken} disabled={loading} />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Verify and continue
            </Button>
          </form>
          <div className="mt-3 flex flex-col items-center gap-1 text-sm">
            <ResendCodeButton endpoint="/api/auth/otp/resend" />
            <Link href="/login" className="font-medium text-primary hover:underline">
              Use a different account
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
