"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { CampaignLifecycleActions } from "@/components/marketing/CampaignLifecycleActions";
import { CampaignWizard } from "@/components/marketing/CampaignWizard";
import { Button } from "@/components/ui/button";
import { isCampaignEditable } from "@/lib/marketing/campaign-lifecycle";
import type { AudienceFilters, CampaignFlowNodeInput, CampaignFormState } from "@/lib/marketing/types";
import { toast } from "sonner";

type LoadedCampaign = CampaignFormState & {
  id: string;
  status: string;
  aiPrompt?: string | null;
  bodyHtml?: string | null;
  subject?: string | null;
  flowNodes?: Array<{
    id: string;
    type: CampaignFlowNodeInput["type"];
    config: Record<string, unknown> | null;
    sortOrder: number;
  }>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asAudienceFilters(value: unknown): AudienceFilters {
  return asRecord(value) as AudienceFilters;
}

function asFlowNodes(
  nodes: LoadedCampaign["flowNodes"]
): CampaignFlowNodeInput[] {
  return (Array.isArray(nodes) ? nodes : []).map((node) => ({
    id: node.id,
    type: node.type,
    config: asRecord(node.config),
    sortOrder: node.sortOrder,
  }));
}

export default function EditMarketingCampaignPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [campaign, setCampaign] = useState<LoadedCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/marketing/campaigns/${id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        setCampaign(data);
      })
      .catch(() => {
        toast.error("Failed to load campaign");
        setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <ContentArea>
        <PageHeader breadcrumb={["Marketing", "Campaigns"]} title="Edit campaign" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </ContentArea>
    );
  }

  if (notFound || !campaign) {
    return (
      <ContentArea>
        <PageHeader breadcrumb={["Marketing", "Campaigns"]} title="Campaign not found" />
        <Button variant="outline" size="sm" asChild>
          <Link href="/marketing/campaigns">Back to campaigns</Link>
        </Button>
      </ContentArea>
    );
  }

  if (!isCampaignEditable(campaign.status)) {
    return (
      <ContentArea>
        <PageHeader
          breadcrumb={["Marketing", "Campaigns", campaign.name, "Edit"]}
          title={campaign.name}
          subtitle="This campaign is closed. Duplicate it to create an editable draft."
          actions={<CampaignLifecycleActions campaign={campaign} variant="buttons" />}
        />
        <Button variant="outline" size="sm" asChild>
          <Link href={`/marketing/campaigns/${campaign.id}`}>View campaign</Link>
        </Button>
      </ContentArea>
    );
  }

  return (
    <ContentArea className="max-w-none">
      <PageHeader
        breadcrumb={["Marketing", "Campaigns", campaign.name, "Edit"]}
        title={`Edit ${campaign.name}`}
        subtitle={
          campaign.status === "ACTIVE"
            ? "This campaign is live. Saving updates the sequence without re-enrolling everyone."
            : "Open campaigns can be edited until they are sent, completed, cancelled, or archived."
        }
      />
      <CampaignWizard
        initial={{
          id: campaign.id,
          status: campaign.status,
          name: campaign.name,
          type: campaign.type,
          channel: campaign.channel,
          subject: campaign.subject ?? "",
          bodyText: campaign.bodyText ?? "",
          bodyHtml: campaign.bodyHtml ?? "",
          aiPrompt: campaign.aiPrompt ?? "",
          audienceFilters: asAudienceFilters(campaign.audienceFilters),
          dripSettings: {
            emailsPerDay: 50,
            smsPerDay: 50,
            ...(asRecord(campaign.dripSettings) as {
              emailsPerDay?: number;
              smsPerDay?: number;
              startAt?: string;
              senderName?: string;
            }),
          },
          steps: campaign.steps ?? [],
          flowNodes: asFlowNodes(campaign.flowNodes),
        }}
        onSaved={(campaignId) => router.push(`/marketing/campaigns/${campaignId}`)}
      />
    </ContentArea>
  );
}
