"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { Globe, Loader2, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GoogleAdsConnectionStatus, GoogleAdsCustomer } from "@/lib/google-ads/types";

export function GoogleAdsConnectionPanel() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<GoogleAdsConnectionStatus | null>(null);
  const [customers, setCustomers] = useState<GoogleAdsCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);

  const redirectUri =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/marketing/google-ads/callback`
      : "/api/marketing/google-ads/callback";

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/marketing/google-ads/status");
    if (res.ok) setStatus(await res.json());
  }, []);

  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const res = await fetch("/api/marketing/google-ads/customers");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load Google Ads accounts");
      setCustomers(data.customers ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load Google Ads accounts");
      setCustomers([]);
    } finally {
      setLoadingCustomers(false);
    }
  }, []);

  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected) toast.success("Google Ads connected");
    if (error) toast.error(decodeURIComponent(error), { duration: 10000 });
  }, [searchParams]);

  useEffect(() => {
    loadStatus()
      .catch(() => toast.error("Failed to load Google Ads status"))
      .finally(() => setLoading(false));
  }, [loadStatus]);

  useEffect(() => {
    if (!status?.connected) return;
    void loadCustomers();
  }, [status?.connected, loadCustomers]);

  async function saveCustomer(customer: GoogleAdsCustomer) {
    setSavingCustomer(true);
    try {
      const res = await fetch("/api/marketing/google-ads/customer", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer.id,
          customerName: customer.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save account");
      toast.success("Google Ads account saved");
      await loadStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save account");
    } finally {
      setSavingCustomer(false);
    }
  }

  async function disconnect() {
    const res = await fetch("/api/marketing/google-ads", { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to disconnect");
      return;
    }
    setCustomers([]);
    await loadStatus();
    toast.success("Disconnected Google Ads");
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading Google Ads...</p>;
  }

  if (!status) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Could not load Google Ads status.
        </CardContent>
      </Card>
    );
  }

  if (!status.configured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-5 w-5" />
            Google Ads
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Set <code className="text-xs">GOOGLE_OAUTH_CLIENT_ID</code> and{" "}
            <code className="text-xs">GOOGLE_OAUTH_CLIENT_SECRET</code> in Vercel, then redeploy.
          </p>
          <p className="text-muted-foreground">
            Also add <code className="text-xs">GOOGLE_ADS_DEVELOPER_TOKEN</code> from your Google
            Ads API developer account.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!status.hasDeveloperToken) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Google Ads developer token</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            OAuth is configured, but <code className="text-xs">GOOGLE_ADS_DEVELOPER_TOKEN</code> is
            missing on the server. Add it in Vercel and redeploy before connecting.
          </p>
          <p className="text-xs">
            Redirect URI for OAuth: <code className="break-all">{redirectUri}</code>
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!status.connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-5 w-5" />
            Google Ads
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Connect the Google account that manages your Google Ads campaigns. After connecting,
            choose which customer account to report on in Marketing → Ads.
          </p>
          <Button asChild>
            <a href="/api/marketing/google-ads">Connect Google Ads</a>
          </Button>
          <p className="text-xs text-muted-foreground">
            OAuth redirect URI: <code className="break-all">{redirectUri}</code>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-5 w-5" />
            Google Ads
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {status.customerName ?? "Select a Google Ads account"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Connected</Badge>
          {status.connectedAt ? (
            <span className="text-xs text-muted-foreground">
              Since {format(new Date(status.connectedAt), "MMM d, yyyy")}
            </span>
          ) : null}
          <Button variant="outline" size="sm" onClick={disconnect}>
            <Unplug className="mr-1 h-4 w-4" />
            Disconnect
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Accessible accounts</p>
          <Button
            size="sm"
            variant="outline"
            disabled={loadingCustomers}
            onClick={() => void loadCustomers()}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${loadingCustomers ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        {loadingCustomers ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading accounts...
          </div>
        ) : customers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No accessible Google Ads accounts found for this Google login.
          </p>
        ) : (
          customers.map((customer) => (
            <div
              key={customer.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div>
                <p className="font-medium">{customer.name}</p>
                <p className="text-sm text-muted-foreground">
                  ID {customer.id}
                  {customer.manager ? " · Manager account" : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant={status.customerId === customer.id ? "default" : "outline"}
                disabled={savingCustomer}
                onClick={() => void saveCustomer(customer)}
              >
                {status.customerId === customer.id ? "Selected" : "Use this account"}
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
