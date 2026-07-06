import Link from "next/link";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { SlackGbpReviewsPanel } from "@/components/settings/SlackGbpReviewsPanel";
import { Button } from "@/components/ui/button";

export default function SlackIntegrationsPage() {
  return (
    <ContentArea className="max-w-3xl">
      <PageHeader
        breadcrumb={["Settings", "Integrations", "Slack"]}
        title="Slack"
        subtitle="Send designed Google review cards to a company Slack channel when new reviews arrive."
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link href="/settings/integrations">Back to integrations</Link>
          </Button>
        }
      />
      <SlackGbpReviewsPanel />
    </ContentArea>
  );
}
