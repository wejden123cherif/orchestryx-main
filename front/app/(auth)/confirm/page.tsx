"use client";

import Link from "next/link";
import { FormEvent, Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { extractApiErrorMessage } from "@/lib/api";

const CODE_LENGTH = 6;

function ConfirmForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { confirm } = useAuth();
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const code = digits.join("");

  const setDigit = (index: number, value: string) => {
    const nextValue = value.replace(/\D/g, "").slice(-1);
    setDigits((current) => {
      const next = [...current];
      next[index] = nextValue;
      return next;
    });

    if (nextValue && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (value: string) => {
    const pasted = value.replace(/\D/g, "").slice(0, CODE_LENGTH).split("");
    if (!pasted.length) return;

    setDigits(Array.from({ length: CODE_LENGTH }, (_, index) => pasted[index] ?? ""));
    inputRefs.current[Math.min(pasted.length, CODE_LENGTH) - 1]?.focus();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    if (code.length !== CODE_LENGTH) {
      setErrorMessage("Enter the 6-digit verification code.");
      return;
    }

    setIsSubmitting(true);

    try {
      await confirm({ email, code });
      router.replace(
        "/login?message=Email%20confirmed.%20You%20can%20now%20sign%20in."
      );
    } catch (error) {
      setErrorMessage(extractApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Confirm your email"
      description="Enter the 6-digit code we sent to your inbox."
      altQuestion="Back to the start?"
      altHref="/login"
      altLabel="Return to sign in"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {errorMessage ? (
          <p className="rounded-lg border border-destructive/25 bg-destructive/5 px-3.5 py-2.5 text-[13px] text-destructive">
            {errorMessage}
          </p>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            className="h-10"
          />
        </div>

        <div className="space-y-2">
          <Label>Verification code</Label>
          <div className="grid grid-cols-6 gap-2">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(node) => {
                  inputRefs.current[index] = node;
                }}
                value={digit}
                onChange={(event) => setDigit(index, event.target.value)}
                onPaste={(event) => {
                  event.preventDefault();
                  handlePaste(event.clipboardData.getData("text"));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Backspace" && !digits[index] && index > 0) {
                    inputRefs.current[index - 1]?.focus();
                  }
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                className="mono h-12 rounded-lg border border-input bg-card text-center text-lg text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                aria-label={`Digit ${index + 1}`}
              />
            ))}
          </div>
        </div>

        <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Verifying..." : "Verify email"}
          {!isSubmitting && <ArrowRight className="h-4 w-4" />}
        </Button>
      </form>

      <p className="mt-5 text-center text-[13px] text-muted-foreground">
        Didn&apos;t get a code?{" "}
        <Link href="/register" className="font-medium text-primary hover:text-primary/80">
          Resend
        </Link>
      </p>
    </AuthShell>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <ConfirmForm />
    </Suspense>
  );
}
