"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { postAuth } from "@/lib/auth-client";

export function ResendCodeButton({ endpoint }: { endpoint: string }) {
  const [seconds, setSeconds] = useState(60);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  async function resend() {
    setBusy(true);
    try {
      await postAuth(endpoint);
      toast.success("A new code is on its way");
      setSeconds(60);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send a new code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={resend} disabled={busy || seconds > 0}>
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {seconds > 0 ? `Resend code in ${seconds}s` : "Resend code"}
    </Button>
  );
}
