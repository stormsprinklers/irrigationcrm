import Link from "next/link";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { MetaWebhookSetup } from "@/components/marketing/MetaWebhookSetup";
import { Button } from "@/components/ui/button";

export default function MetaIntegrationsPage() {
  return (
    <ContentArea className="max-w-3xl">
      <PageHeader
        breadcrumb={["Settings", "Integrations", "Meta webhooks"]}
        title="Meta webhooks"
        subtitle="Connect Facebook and Instagram for social DMs, post sync, and webhook events."
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link href="/settings/integrations">Back to integrations</Link>
          </Button>
        }
      />
      <MetaWebhookSetup />
    </ContentArea>
  );
}
