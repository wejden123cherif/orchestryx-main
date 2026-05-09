"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordField } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { extractApiErrorMessage } from "@/lib/api";

const strengthLevels = [
  { label: "Weak", color: "bg-destructive", textColor: "text-destructive" },
  { label: "Fair", color: "bg-warning", textColor: "text-warning" },
  { label: "Strong", color: "bg-primary", textColor: "text-primary" },
  { label: "Excellent", color: "bg-success", textColor: "text-success" },
] as const;

function getPasswordScore(password: string) {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
}

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const score = useMemo(() => getPasswordScore(password), [password]);
  const level = score > 0 ? strengthLevels[score - 1] : null;

  const checklist = [
    { label: "8+ characters", met: password.length >= 8 },
    { label: "Upper & lowercase", met: /[A-Z]/.test(password) && /[a-z]/.test(password) },
    { label: "Number or symbol", met: /\d/.test(password) || /[^A-Za-z0-9]/.test(password) },
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
      title="Create your account"
      description="Get started with Orchestryx in under a minute."
      altQuestion="Already have an account?"
      altHref="/login"
      altLabel="Sign in"
    >
      <div className="space-y-5">
        {errorMessage ? (
          <p className="rounded-lg border border-destructive/25 bg-destructive/5 px-3.5 py-2.5 text-[13px] text-destructive">
            {errorMessage}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Work email</Label>
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

          <div className="space-y-3">
            <PasswordField
              id="password"
              label="Password"
              placeholder="Create a strong password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />

            {/* strength bar */}
            <div className="space-y-2.5">
              <div className="flex gap-1.5">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      i < score ? (level?.color ?? "bg-muted") : "bg-muted"
                    }`}
                  />
                ))}
              </div>
              {level && (
                <p className={`text-xs ${level.textColor}`}>{level.label}</p>
              )}
            </div>

            {/* checklist */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {checklist.map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div
                    className={`flex h-4 w-4 items-center justify-center rounded-full transition-colors ${
                      item.met
                        ? "bg-success/15 text-success"
                        : "bg-muted text-muted-foreground/40"
                    }`}
                  >
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </div>
                  <span className={`text-xs ${item.met ? "text-foreground" : "text-muted-foreground"}`}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Creating account..." : "Create account"}
            {!isSubmitting && <ArrowRight className="h-4 w-4" />}
          </Button>
        </form>

        <p className="text-center text-xs leading-relaxed text-muted-foreground/60">
          By creating an account you agree to our terms of service.
        </p>
      </div>
    </AuthShell>
  );
}
