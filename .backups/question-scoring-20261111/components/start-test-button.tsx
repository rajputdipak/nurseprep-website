"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function StartTestButton({ testId }: { testId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
    try {
      const res = await fetch("/api/attempts/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test_id: testId }),
      });
      const data = await res.json();
      if (res.status === 400) {
        toast.error(data.error ?? "Not enough fresh questions available. Try another test category.");
        return;
      }
      if (!res.ok) {
        toast.error(data.error ?? "Could not start the test. Please try again.");
        return;
      }
      router.push(`/test/${data.attempt_id}`);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={start} disabled={loading} className="w-full sm:w-auto">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
      Start
    </Button>
  );
}