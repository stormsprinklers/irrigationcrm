"use client";

import { useRouter } from "next/navigation";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { CampaignWizard } from "@/components/marketing/CampaignWizard";

export default function NewMarketingCampaignPage() {
  const router = useRouter();

  return (
    <ContentArea className="flex h-full max-w-none flex-col overflow-y-auto">
      <PageHeader
        className="shrink-0"
        breadcrumb={["Marketing", "Campaigns", "New"]}
        title="New campaign"
        subtitle="Open the campaign builder to filter your audience and design the sequence."
      />
      <div className="min-h-0 flex-1">
        <CampaignWizard onSaved={(id) => router.push(`/marketing/campaigns/${id}`)} />
      </div>
    </ContentArea>
  );
}
