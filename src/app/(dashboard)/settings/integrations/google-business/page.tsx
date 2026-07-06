import Link from "next/link";
import { Suspense } from "react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { GoogleBusinessConnectionPanel } from "@/components/settings/GoogleBusinessConnectionPanel";
import { Button } from "@/components/ui/button";

export default function GoogleBusinessIntegrationsPage() {
  return (
    <ContentArea className="max-w-3xl">
      <PageHeader
        breadcrumb={["Settings", "Integrations", "Google Business Profile"]}
        title="Google Business Profile"
        subtitle="Connect your Google account and choose the listing used for marketing metrics, reviews, posts, and photos."
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link href="/settings/integrations">Back to integrations</Link>
          </Button>
        }
      />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading...</p>}>
        <GoogleBusinessConnectionPanel />
      </Suspense>
    </ContentArea>
  );
}
