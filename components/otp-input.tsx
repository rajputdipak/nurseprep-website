"use client";

import { Input } from "@/components/ui/input";

export function OtpInput({
  id = "otp",
  value,
  onChange,
  disabled,
  maxLength = 10,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  maxLength?: number;
}) {
  return (
    <Input
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, maxLength))}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={maxLength}
      placeholder="Enter code"
      disabled={disabled}
      autoFocus
      aria-label="Verification code from your email"
      className="h-12 text-center text-lg font-semibold tracking-[0.35em] tabular-nums"
    />
  );
}
