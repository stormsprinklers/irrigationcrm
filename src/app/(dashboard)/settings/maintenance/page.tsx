import Link from "next/link";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SmartIrrigationPanel } from "@/components/maintenance-plans/SmartIrrigationPanel";

export default function SettingsMaintenancePage() {
  return (
    <ContentArea className="max-w-3xl">
      <PageHeader
        breadcrumb={["Settings", "Maintenance"]}
        title="Maintenance plan settings"
        subtitle="Configure smart irrigation integrations for maintenance plans."
      />

      <div className="space-y-6">
        <SmartIrrigationPanel />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rachio API key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect Rachio controllers to sync zone data with maintenance visits. Coming soon.
            </p>
            <Input type="password" placeholder="API key" disabled />
            <Button disabled>Save Rachio key</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hydrawise API key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect Hydrawise controllers for smart irrigation insights. Coming soon.
            </p>
            <Input type="password" placeholder="API key" disabled />
            <Button disabled>Save Hydrawise key</Button>
          </CardContent>
        </Card>

        <Button variant="outline" asChild>
          <Link href="/maintenance-plans">Back to maintenance plans</Link>
        </Button>
      </div>
    </ContentArea>
  );
}
