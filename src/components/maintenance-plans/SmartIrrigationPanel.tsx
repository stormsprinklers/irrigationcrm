import Link from "next/link";
import { Droplets, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SmartIrrigationPanel({ compact = false }: { compact?: boolean }) {
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
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-dashed p-4">
          <div className="mb-2 flex items-center gap-2">
            <Droplets className="h-5 w-5 text-green-600" />
            <span className="font-medium">Rachio</span>
          </div>
          <p className="text-sm text-muted-foreground">Integration coming soon</p>
        </div>
        <div className="rounded-lg border border-dashed p-4">
          <div className="mb-2 flex items-center gap-2">
            <Droplets className="h-5 w-5 text-blue-600" />
            <span className="font-medium">Hydrawise</span>
          </div>
          <p className="text-sm text-muted-foreground">Integration coming soon</p>
        </div>
      </CardContent>
    </Card>
  );
}
