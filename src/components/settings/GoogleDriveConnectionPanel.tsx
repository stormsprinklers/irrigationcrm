"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { HardDrive, Loader2, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GoogleDriveConnectionStatus } from "@/lib/google-drive/types";

export function GoogleDriveConnectionPanel() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<GoogleDriveConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const redirectUri =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/marketing/google-drive/callback`
      : "/api/marketing/google-drive/callback";

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/marketing/google-drive/status");
    if (res.ok) setStatus(await res.json());
  }, []);

  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected) toast.success("Google Drive connected");
    if (error) toast.error(decodeURIComponent(error), { duration: 10000 });
  }, [searchParams]);

  useEffect(() => {
    loadStatus()
      .catch(() => toast.error("Failed to load Google Drive status"))
      .finally(() => setLoading(false));
  }, [loadStatus]);

  async function disconnect() {
    const res = await fetch("/api/marketing/google-drive", { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to disconnect");
      return;
    }
    await loadStatus();
    toast.success("Disconnected Google Drive");
  }

  if (loading || !status) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Google Drive…
        </CardContent>
      </Card>
    );
  }

  if (!status.configured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrive className="h-5 w-5" />
            Google Drive
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Use the same general Google OAuth client already configured for Search Console / Ads.
            Set these on the server:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <code className="text-xs">GOOGLE_OAUTH_CLIENT_ID</code>:{" "}
              {status.oauthEnv.hasClientId ? "detected" : "missing"}
            </li>
            <li>
              <code className="text-xs">GOOGLE_OAUTH_CLIENT_SECRET</code>:{" "}
              {status.oauthEnv.hasClientSecret ? "detected" : "missing"}
            </li>
          </ul>
          <p>
            On the OAuth consent screen, add scope{" "}
            <code className="text-xs">https://www.googleapis.com/auth/drive.file</code>.
          </p>
          <p>
            Add this authorized redirect URI: <code className="text-xs">{redirectUri}</code>
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
            <HardDrive className="h-5 w-5" />
            Google Drive
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Connect Drive so marketing can pick images for Google Business posts and social media.
            Uses the <code className="text-xs">drive.file</code> scope (Picker-selected files only).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Redirect URI: <code className="text-xs">{redirectUri}</code>
          </p>
          {!status.pickerConfigured ? (
            <p className="text-sm text-amber-700">
              Also set <code className="text-xs">GOOGLE_PICKER_API_KEY</code> (or enable the Picker
              API on your existing <code className="text-xs">GOOGLE_MAPS_API_KEY</code>) so the file
              browser can open in the app.
            </p>
          ) : null}
          <Button asChild>
            <a href="/api/marketing/google-drive">
              <HardDrive className="mr-2 h-4 w-4" />
              Connect Google Drive
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrive className="h-5 w-5" />
            Google Drive
          </CardTitle>
          <Badge variant="success">Connected</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Images selected with Google Picker are available in Google Business and social post
          composers.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.connectedAt ? (
          <p className="text-sm text-muted-foreground">
            Connected {format(new Date(status.connectedAt), "MMM d, yyyy h:mm a")}
          </p>
        ) : null}
        {!status.pickerConfigured ? (
          <p className="text-sm text-amber-700">
            Picker API key missing — set <code className="text-xs">GOOGLE_PICKER_API_KEY</code> (or
            enable Picker on <code className="text-xs">GOOGLE_MAPS_API_KEY</code>) to browse Drive
            files in marketing tools.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Enable Google Picker API and Google Drive API on the
            same Google Cloud project. Redirect URI:{" "}
            <code className="text-xs">{redirectUri}</code>
          </p>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => void disconnect()}>
          <Unplug className="mr-2 h-4 w-4" />
          Disconnect
        </Button>
      </CardContent>
    </Card>
  );
}
