import Link from "next/link";
import { Suspense } from "react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { GoogleAdsConnectionPanel } from "@/components/settings/GoogleAdsConnectionPanel";
import { PipelineConversionDeliveryPanel } from "@/components/settings/PipelineConversionDeliveryPanel";
import { Button } from "@/components/ui/button";

export default function GoogleAdsIntegrationsPage() {
  return (
    <ContentArea className="max-w-3xl">
      <PageHeader
        breadcrumb={["Settings", "Integrations", "Google Ads"]}
        title="Google Ads"
        subtitle="Connect Google Ads for reporting and automatic CRM pipeline conversion delivery through Data Manager."
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link href="/settings/integrations">Back to integrations</Link>
          </Button>
        }
      />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading...</p>}>
        <GoogleAdsConnectionPanel />
      </Suspense>
      <div className="mt-6">
        <PipelineConversionDeliveryPanel platform="GOOGLE" />
      </div>
    </ContentArea>
  );
}
