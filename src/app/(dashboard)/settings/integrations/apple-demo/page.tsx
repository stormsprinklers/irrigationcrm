"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type DemoAccount = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export default function AppleDemoIntegrationsPage() {
  const [account, setAccount] = useState<DemoAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [plainPassword, setPlainPassword] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/integrations/apple-demo");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setAccount(data.account ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load Apple demo account");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(action: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/settings/integrations/apple-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setAccount(data.account ?? null);
      if (typeof data.plainPassword === "string") {
        setPlainPassword(data.plainPassword);
        setShowPassword(true);
        toast.success(
          action === "create" ? "Apple demo account created" : "Password reset — copy it now"
        );
      } else if (action === "enable") {
        toast.success("Apple demo account enabled");
      } else if (action === "disable") {
        toast.success("Apple demo account disabled");
        setPlainPassword(null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy");
    }
  }

  return (
    <ContentArea className="max-w-3xl">
      <PageHeader
        breadcrumb={["Settings", "Integrations", "Apple demo"]}
        title="Apple demo account"
        subtitle="Create a technician login for App Store review — no phone number or 2FA required. Disable anytime after review."
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link href="/settings/integrations">Back to integrations</Link>
          </Button>
        }
      />

      <div className="space-y-6">
        <section className="rounded-lg border border-border bg-white p-6 space-y-3">
          <h2 className="text-base font-semibold">How it works</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Creates a TECH (technician) employee with the same field permissions as a normal tech.</li>
            <li>Signs into Radar (iOS) and the CRM web app with email + password only — MFA is skipped.</li>
            <li>No phone number is required on the account.</li>
            <li>Use <strong>Disable</strong> after App Review to archive the account without deleting it.</li>
          </ul>
        </section>

        <section className="rounded-lg border border-border bg-white p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Demo credentials</h2>
            {account ? (
              <Badge variant={account.enabled ? "default" : "secondary"}>
                {account.enabled ? "Enabled" : "Disabled"}
              </Badge>
            ) : null}
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !account ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                No Apple demo account yet. Create one, then paste the email and password into App Store
                Connect review notes.
              </p>
              <Button type="button" disabled={busy} onClick={() => void runAction("create")}>
                {busy ? "Creating…" : "Create Apple demo account"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="font-mono text-sm break-all">{account.email}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void copyText("Email", account.email)}
                >
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  Copy
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="text-xs text-muted-foreground">Password</p>
                  {plainPassword ? (
                    <p className="font-mono text-sm break-all">
                      {showPassword ? plainPassword : "••••••••••••••"}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Password is only shown when created or reset. Use Reset password to generate a
                      new one.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {plainPassword ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        {showPassword ? (
                          <EyeOff className="mr-1 h-3.5 w-3.5" />
                        ) : (
                          <Eye className="mr-1 h-3.5 w-3.5" />
                        )}
                        {showPassword ? "Hide" : "Show"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void copyText("Password", plainPassword)}
                      >
                        <Copy className="mr-1 h-3.5 w-3.5" />
                        Copy
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Role: Technician · Put these credentials in App Store Connect → App Review Information.
              </p>

              <div className="flex flex-wrap gap-2 pt-2">
                {account.enabled ? (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => void runAction("disable")}
                  >
                    Disable account
                  </Button>
                ) : (
                  <Button type="button" disabled={busy} onClick={() => void runAction("enable")}>
                    Enable account
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void runAction("reset_password")}
                >
                  Reset password
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </ContentArea>
  );
}
