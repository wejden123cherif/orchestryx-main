"use client";

import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
      title="Sign in"
      description="Access your dashboard with your email and password."
      altQuestion="Need access?"
      altHref="/register"
      altLabel="Create an account"
    >
      <div className="space-y-5">
        {successMessage ? (
          <p className="rounded-lg border border-success/35 bg-success/10 px-3 py-2 text-sm text-green-300">
            {successMessage}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-red-300">
            {errorMessage}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">
              Email address
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              spellCheck={false}
              required
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Use the email tied to your account.
            </p>
          </div>

          <PasswordField
            id="password"
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            helperText="Your session stays in-memory for this browser tab."
          />

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Signing in..." : "Sign in to dashboard"}
          </Button>
        </form>

        <div className="rounded-lg border border-border bg-secondary/60 p-4">
          <p className="text-sm leading-6 text-muted-foreground">
            Just signed up? Confirm your email before signing in.
          </p>
          <Link
            href="/confirm"
            className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary transition hover:text-primary/80"
          >
            Confirm email
          </Link>
        </div>
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
