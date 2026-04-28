"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordField } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { extractApiErrorMessage } from "@/lib/api";

function getPasswordStrength(password: string) {
  if (!password) {
    return {
      label: "No password yet",
      tone: "border-border text-muted-foreground",
      score: 0,
    };
  }

  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) {
    return { label: "Weak", tone: "border-destructive/35 text-red-300", score: 25 };
  }

  if (score === 2) {
    return { label: "Fair", tone: "border-warning/35 text-amber-300", score: 50 };
  }

  if (score === 3) {
    return { label: "Strong", tone: "border-primary/35 text-indigo-200", score: 75 };
  }

  return { label: "Excellent", tone: "border-success/35 text-green-300", score: 100 };
}

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordStrength = useMemo(
    () => getPasswordStrength(password),
    [password]
  );

  const checklist = [
    { label: "At least 8 characters", valid: password.length >= 8 },
    { label: "Upper and lower case", valid: /[A-Z]/.test(password) && /[a-z]/.test(password) },
    { label: "A number or symbol", valid: /\d/.test(password) || /[^A-Za-z0-9]/.test(password) },
  ];

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await register({ email, password });
      router.replace(`/confirm?email=${encodeURIComponent(email)}`);
    } catch (error) {
      setErrorMessage(extractApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Create account"
      description="Set up your account and continue to email verification."
      altQuestion="Already have an account?"
      altHref="/login"
      altLabel="Sign in"
    >
      <div className="space-y-5">
        {errorMessage ? (
          <p className="rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-red-300">
            {errorMessage}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">
              Work email
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
              We will use this for verification and sign-in.
            </p>
          </div>

          <div className="space-y-4 rounded-lg border border-border bg-secondary/60 p-4">
            <PasswordField
              id="password"
              label="Create password"
              placeholder="Create a strong password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              helperText="Use a strong password you can store in your password manager."
            />

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Password strength
                </p>
                <span className={`rounded-full border px-2.5 py-1 text-xs ${passwordStrength.tone}`}>
                  {passwordStrength.label}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${passwordStrength.score}%` }}
                />
              </div>

              <div className="grid gap-2">
                {checklist.map((item) => (
                  <div key={item.label} className="flex items-center gap-2 text-sm">
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded-full ${
                        item.valid ? "bg-success/10 text-green-300" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                    </div>
                    <span className={item.valid ? "text-foreground" : "text-muted-foreground"}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Creating account..." : "Create account"}
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}
