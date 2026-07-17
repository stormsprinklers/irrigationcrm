import Link from "next/link";
import { Suspense } from "react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { GoogleDriveConnectionPanel } from "@/components/settings/GoogleDriveConnectionPanel";
import { Button } from "@/components/ui/button";

export default function GoogleDriveIntegrationsPage() {
  return (
    <ContentArea className="max-w-3xl">
      <PageHeader
        breadcrumb={["Settings", "Integrations", "Google Drive"]}
        title="Google Drive"
        subtitle="Connect Google Drive so marketing can use Drive images for Google Business and social posts."
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link href="/settings/integrations">Back to integrations</Link>
          </Button>
        }
      />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading...</p>}>
        <GoogleDriveConnectionPanel />
      </Suspense>
    </ContentArea>
  );
}
