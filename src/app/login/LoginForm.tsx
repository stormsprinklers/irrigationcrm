"use client";

import { signIn } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { stormBrand } from "@/lib/branding";

type Step = "credentials" | "mfa";

export default function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/home";
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [phoneMasked, setPhoneMasked] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          purpose: "LOGIN",
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        challengeId?: string;
        phoneMasked?: string;
        debugCode?: string;
      };
      if (!res.ok || !data.challengeId) {
        setError(data.error ?? "Invalid email or password");
        return;
      }
      setChallengeId(data.challengeId);
      setPhoneMasked(data.phoneMasked ?? "");
      if (data.debugCode) setCode(data.debugCode);
      setStep("mfa");
    } catch (err) {
      console.error("Login error:", err);
      setError("Sign in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        challengeId,
        code: code.trim(),
        redirect: false,
      });

      if (!result) {
        setError("Sign in failed. Please try again.");
        return;
      }
      if (result.error || !result.ok) {
        setError("Invalid verification code");
        return;
      }
      window.location.assign(callbackUrl);
    } catch (err) {
      console.error("MFA error:", err);
      setError("Sign in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/staff/mfa", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, purpose: "LOGIN" }),
      });
      const data = (await res.json()) as {
        error?: string;
        challengeId?: string;
        phoneMasked?: string;
        debugCode?: string;
      };
      if (!res.ok || !data.challengeId) {
        setError(data.error ?? "Could not resend code");
        return;
      }
      setChallengeId(data.challengeId);
      setPhoneMasked(data.phoneMasked ?? phoneMasked);
      if (data.debugCode) setCode(data.debugCode);
    } catch {
      setError("Could not resend code");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <Card className="w-full max-w-md border-storm-ice/60">
        <CardHeader className="items-center text-center">
          <Image
            src={stormBrand.logoPath}
            alt="Storm Sprinklers"
            width={220}
            height={220}
            priority
            className="mx-auto mb-2 h-24 w-auto object-contain"
          />
          <CardTitle className="font-display text-2xl text-storm-navy">
            Irrigation CRM
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Storm Sprinklers staff sign in
          </p>
        </CardHeader>
        <CardContent>
          {step === "credentials" ? (
            <form onSubmit={handleCredentials} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="email">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="password">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Checking…" : "Continue"}
              </Button>
              <p className="text-center text-sm">
                <Link
                  href="/forgot-password"
                  className="text-storm-medium-blue hover:underline"
                >
                  Forgot password?
                </Link>
              </p>
            </form>
          ) : (
            <form onSubmit={handleMfa} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enter the 6-digit code texted to {phoneMasked || "your phone"}.
              </p>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="code">
                  Verification code
                </label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  maxLength={8}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Verifying…" : "Verify and sign in"}
              </Button>
              <div className="flex justify-between text-sm">
                <button
                  type="button"
                  className="text-storm-medium-blue hover:underline"
                  onClick={() => {
                    setStep("credentials");
                    setCode("");
                    setError("");
                  }}
                  disabled={loading}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="text-storm-medium-blue hover:underline"
                  onClick={() => void resendCode()}
                  disabled={loading}
                >
                  Resend code
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
