import Link from "next/link";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { PipelineConversionDeliveryPanel } from "@/components/settings/PipelineConversionDeliveryPanel";
import { ZapierPipelineWebhookPanel } from "@/components/settings/ZapierPipelineWebhookPanel";
import { Button } from "@/components/ui/button";

export default function ZapierIntegrationPage() {
  return (
    <ContentArea className="max-w-3xl">
      <PageHeader
        breadcrumb={["Settings", "Integrations", "Zapier"]}
        title="Zapier ad tracking"
        subtitle="Send the same CRM pipeline conversion events to a Zapier Catch Hook while ad-platform integrations are being approved."
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link href="/settings/integrations">Back to integrations</Link>
          </Button>
        }
      />
      <ZapierPipelineWebhookPanel />
      <div className="mt-6">
        <PipelineConversionDeliveryPanel platform="ZAPIER" />
      </div>
    </ContentArea>
  );
}
