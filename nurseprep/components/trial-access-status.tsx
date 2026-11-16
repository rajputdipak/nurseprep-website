"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { formatPaymentDate } from "@/lib/payment-types";
import { formatTrialRemaining, getTrialState, TRIAL_DAYS, type TrialState } from "@/lib/access";

interface Props {
  createdAt: string;
  initial: TrialState | null;
  mode?: "badge" | "line";
}

function useLiveTrial(createdAt: string, initial: TrialState | null) {
  const [state, setState] = useState(initial);

  useEffect(() => {
    const update = () => setState(getTrialState(createdAt));
    update();
    const timer = window.setInterval(update, 30_000);
    const updateWhenVisible = () => {
      if (document.visibilityState === "visible") update();
    };
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", updateWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", updateWhenVisible);
    };
  }, [createdAt]);

  return state;
}

export function TrialAccessStatus({ createdAt, initial, mode = "badge" }: Props) {
  const state = useLiveTrial(createdAt, initial);

  if (!state) {
    return mode === "badge" ? (
      <Badge variant="secondary" className="px-3 py-1.5 text-sm">Trial status unavailable</Badge>
    ) : null;
  }

  if (mode === "line") {
    if (!state.active) return null;
    return (
      <p className="text-xs text-muted-foreground">
        {TRIAL_DAYS}-day free trial: {state.daysLeft} {state.daysLeft === 1 ? "day" : "days"} left ({formatTrialRemaining(state.remainingMs)})
      </p>
    );
  }

  if (!state.active) {
    return (
      <div className="space-y-1">
        <Badge variant="warning" className="px-3 py-1.5 text-sm">Free access ended</Badge>
        <p className="text-xs text-muted-foreground">
          Your {TRIAL_DAYS}-day free trial has ended. Choose a plan to continue.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Badge variant="success" className="px-3 py-1.5 text-sm">
        Free Access — {state.daysLeft} {state.daysLeft === 1 ? "day" : "days"} left
      </Badge>
      <p className="text-xs text-muted-foreground">
        {formatTrialRemaining(state.remainingMs)} remaining · Ends {formatPaymentDate(new Date(state.endsAt).toISOString())}
      </p>
    </div>
  );
}
