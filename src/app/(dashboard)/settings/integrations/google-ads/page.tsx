import Link from "next/link";
import { Suspense } from "react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { GoogleAdsConnectionPanel } from "@/components/settings/GoogleAdsConnectionPanel";
import { Button } from "@/components/ui/button";

export default function GoogleAdsIntegrationsPage() {
  return (
    <ContentArea className="max-w-3xl">
      <PageHeader
        breadcrumb={["Settings", "Integrations", "Google Ads"]}
        title="Google Ads"
        subtitle="Connect Google Ads and choose the customer account for PPC campaign reporting in Marketing → Ads."
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link href="/settings/integrations">Back to integrations</Link>
          </Button>
        }
      />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading...</p>}>
        <GoogleAdsConnectionPanel />
      </Suspense>
    </ContentArea>
  );
}
