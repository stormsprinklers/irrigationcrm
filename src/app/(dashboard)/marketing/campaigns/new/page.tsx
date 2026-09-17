"use client";

import { useRouter } from "next/navigation";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { CampaignWizard } from "@/components/marketing/CampaignWizard";

export default function NewMarketingCampaignPage() {
  const router = useRouter();

  return (
    <ContentArea className="max-w-none">
      <PageHeader
        breadcrumb={["Marketing", "Campaigns", "New"]}
        title="New campaign"
        subtitle="Open the campaign builder to filter your audience and design the sequence."
      />
      <CampaignWizard
        onSaved={(id) => router.push(`/marketing/campaigns/${id}`)}
        onDraftCreated={(id) => router.replace(`/marketing/campaigns/${id}/edit`)}
      />
    </ContentArea>
  );
}
