"use client";

import { useRouter } from "next/navigation";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { CampaignWizard } from "@/components/marketing/CampaignWizard";

export default function NewMarketingCampaignPage() {
  const router = useRouter();

  return (
    <ContentArea className="max-w-6xl">
      <PageHeader
        breadcrumb={["Marketing", "Campaigns", "New"]}
        title="New campaign"
        subtitle="Target customers, generate branded emails with AI, and send or schedule."
      />
      <CampaignWizard onSaved={(id) => router.push(`/marketing/campaigns/${id}`)} />
    </ContentArea>
  );
}
