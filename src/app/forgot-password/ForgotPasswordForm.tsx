"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { stormBrand } from "@/lib/branding";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/auth/staff/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setError(data.error ?? "Request failed");
        return;
      }
      setMessage(
        data.message ??
          "If an account exists for that email, a reset link has been sent.",
      );
    } catch {
      setError("Request failed. Try again.");
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
            width={180}
            height={180}
            className="mx-auto mb-2 h-20 w-auto object-contain"
          />
          <CardTitle className="font-display text-2xl text-storm-navy">
            Forgot password
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            We&apos;ll email a reset link. This password is used for CRM and LMS.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="email">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {message && <p className="text-sm text-green-700">{message}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending…" : "Send reset link"}
            </Button>
            <p className="text-center text-sm">
              <Link href="/login" className="text-storm-medium-blue hover:underline">
                Back to sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
