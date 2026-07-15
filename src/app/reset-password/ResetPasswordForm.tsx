"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { stormBrand } from "@/lib/branding";

export default function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/staff/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not reset password");
        return;
      }
      router.replace("/login?reset=1");
    } catch {
      setError("Could not reset password");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-destructive">
          Missing reset token.{" "}
          <Link href="/forgot-password" className="underline">
            Request a new link
          </Link>
        </p>
      </div>
    );
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
            Set new password
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Updates your password for CRM and LMS.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="password">
                New password
              </label>
              <Input
                id="password"
                type="password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="confirm">
                Confirm password
              </label>
              <Input
                id="confirm"
                type="password"
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Saving…" : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
