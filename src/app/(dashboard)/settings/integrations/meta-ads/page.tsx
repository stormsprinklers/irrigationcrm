import Link from "next/link";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { MetaAdsConnectionPanel } from "@/components/settings/MetaAdsConnectionPanel";
import { PipelineConversionDeliveryPanel } from "@/components/settings/PipelineConversionDeliveryPanel";
import { Button } from "@/components/ui/button";

export default function MetaAdsIntegrationsPage() {
  return (
    <ContentArea className="max-w-3xl">
      <PageHeader
        breadcrumb={["Settings", "Integrations", "Meta Ads"]}
        title="Meta Ads"
        subtitle="Link Meta Ads reporting and configure Conversions API delivery for CRM pipeline stages."
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link href="/settings/integrations">Back to integrations</Link>
          </Button>
        }
      />
      <MetaAdsConnectionPanel />
      <div className="mt-6">
        <PipelineConversionDeliveryPanel platform="META" />
      </div>
    </ContentArea>
  );
}
