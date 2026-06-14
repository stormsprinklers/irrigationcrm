"use client";

import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCompanySettings } from "@/components/settings/useCompanySettings";

export default function SettingsBillingPage() {
  const { company, loading } = useCompanySettings();

  return (
    <ContentArea className="max-w-2xl">
      <PageHeader breadcrumb={["Settings", "Billing"]} title="Billing" />
      {loading || !company ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">CRM subscription</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p><span className="text-muted-foreground">Plan:</span> {company.subscriptionTier ?? "Professional"}</p>
            <p><span className="text-muted-foreground">Billing contact:</span> {company.supportEmail ?? company.name}</p>
            <Button variant="outline" disabled>Manage subscription (coming soon)</Button>
          </CardContent>
        </Card>
      )}
    </ContentArea>
  );
}
