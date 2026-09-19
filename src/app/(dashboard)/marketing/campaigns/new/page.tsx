"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { CampaignTemplatePicker } from "@/components/marketing/CampaignTemplatePicker";
import { CampaignWizard } from "@/components/marketing/CampaignWizard";
import { getCampaignTemplate } from "@/lib/marketing/campaign-templates";

export default function NewMarketingCampaignPage() {
  const router = useRouter();
  const [templateId, setTemplateId] = useState("sprinkler-winterization-2026");
  const template = templateId === "blank" ? null : getCampaignTemplate(templateId);

  return (
    <ContentArea className="max-w-none">
      <PageHeader
        breadcrumb={["Marketing", "Campaigns", "New"]}
        title="New campaign"
        subtitle="Choose a starting point, review the audience, and tailor the sequence before activating."
      />
      <CampaignTemplatePicker value={templateId} onChange={setTemplateId} />
      <CampaignWizard
        key={templateId}
        initial={template?.initial}
        onSaved={(id) => router.push(`/marketing/campaigns/${id}`)}
        onDraftCreated={(id) => router.replace(`/marketing/campaigns/${id}/edit`)}
      />
    </ContentArea>
  );
}
