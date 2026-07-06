import Link from "next/link";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { MetaAdsConnectionPanel } from "@/components/settings/MetaAdsConnectionPanel";
import { Button } from "@/components/ui/button";

export default function MetaAdsIntegrationsPage() {
  return (
    <ContentArea className="max-w-3xl">
      <PageHeader
        breadcrumb={["Settings", "Integrations", "Meta Ads"]}
        title="Meta Ads"
        subtitle="Link your Meta ad account for Facebook and Instagram paid campaign reporting in Marketing → Ads."
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link href="/settings/integrations">Back to integrations</Link>
          </Button>
        }
      />
      <MetaAdsConnectionPanel />
    </ContentArea>
  );
}
