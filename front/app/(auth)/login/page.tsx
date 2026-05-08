"use client";

import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordField } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { extractApiErrorMessage } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const successMessage = searchParams.get("message");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await login({ email, password });
      router.replace("/dashboard");
    } catch (error) {
      setErrorMessage(extractApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to your Orchestryx console."
      altQuestion="Need access?"
      altHref="/register"
      altLabel="Create an account"
    >
      <div className="space-y-5">
        {successMessage ? (
          <p className="rounded-lg border border-success/25 bg-success/5 px-3.5 py-2.5 text-[13px] text-success">
            {successMessage}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="rounded-lg border border-destructive/25 bg-destructive/5 px-3.5 py-2.5 text-[13px] text-destructive">
            {errorMessage}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              spellCheck={false}
              required
              className="h-10"
            />
          </div>

          <PasswordField
            id="password"
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />

          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
            {!isSubmitting && <ArrowRight className="h-4 w-4" />}
          </Button>
        </form>

        <div className="relative py-3">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-background px-3 text-xs text-muted-foreground/60">or</span>
          </div>
        </div>

        <Link
          href="/confirm"
          className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-[13px] font-medium text-muted-foreground shadow-sm transition hover:bg-secondary hover:text-foreground"
        >
          Confirm email verification code
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-40 h-80 w-[min(420px,calc(100vw-2.5rem))]" />}>
      <LoginForm />
    </Suspense>
  );
}
