"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AffiliateMagicSignIn({ token }: { token: string }) {
  const started = useRef(false);
  const [error, setError] = useState(!token ? "This sign-in link is invalid." : "");

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    window.history.replaceState({}, "", "/affiliate/sign-in");

    void signIn("credentials", {
      affiliateToken: token,
      redirect: false,
    }).then((result) => {
      if (!result?.ok || result.error) {
        setError("This sign-in link is invalid, expired, or has already been used.");
        return;
      }
      window.location.replace("/affiliate");
    }).catch(() => {
      setError("Sign in failed. Ask your account administrator for a new link.");
    });
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Affiliate portal</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          {error ? (
            <div className="space-y-2">
              <p className="font-medium text-destructive">Unable to sign in</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Signing you into your affiliate account…</p>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
