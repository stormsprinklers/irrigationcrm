"use client";

import Link from "next/link";
import { Droplets, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SmartIrrigationPanel({
  compact = false,
  personId = null,
  deviceCount,
}: {
  compact?: boolean;
  personId?: string | null;
  deviceCount?: number;
}) {
  const rachioConnected = Boolean(personId);

  return (
    <Card className={compact ? "" : "h-full"}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold">Smart irrigation</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/settings/maintenance">
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-border p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Droplets className="h-5 w-5 text-green-600" />
              <span className="font-medium">Rachio</span>
            </div>
            <Badge variant={rachioConnected ? "default" : "secondary"}>
              {rachioConnected ? "Connected" : "Not connected"}
            </Badge>
          </div>
          {rachioConnected ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Person ID: {personId}</p>
              {deviceCount != null ? <p>{deviceCount} controller(s) on account</p> : null}
              <p>
                Link controllers in{" "}
                <Link href="/settings/maintenance" className="text-primary hover:underline">
                  Settings → Maintenance
                </Link>
                , then control them on each customer&apos;s <strong>Properties</strong> tab.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Add your API key and test the connection in Settings → Maintenance.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
