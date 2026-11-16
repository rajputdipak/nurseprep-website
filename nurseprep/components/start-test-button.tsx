"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function StartTestButton({ testId, disabled = false }: { testId: string; disabled?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accessExpired, setAccessExpired] = useState(false);

  async function start() {
    setLoading(true);
    setError("");
    setAccessExpired(false);
    try {
      const res = await fetch("/api/attempts/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test_id: testId }),
      });
      const data = await res.json();
      if (!res.ok) {
        const message = data.error ?? "Could not start the test. Please try again.";
        setError(message);
        setAccessExpired(res.status === 402);
        toast.error(message);
        return;
      }
      router.push(`/test/${data.attempt_id}`);
    } catch {
      setError("Network error. Please try again.");
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={start} disabled={loading || disabled} className="w-full sm:w-auto">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        Start
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {accessExpired && <Link href="/payments" className="inline-block text-sm font-medium text-primary hover:underline">View plans</Link>}
    </div>
  );
}
