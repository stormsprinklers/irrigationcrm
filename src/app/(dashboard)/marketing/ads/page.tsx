import { Plus } from "lucide-react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  MarketingEmptyTable,
  MarketingMetricGrid,
  MarketingSectionCard,
} from "@/components/marketing/MarketingMetricGrid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function MarketingAdsPage() {
  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Marketing", "Ads"]}
        title="Paid ads"
        subtitle="Google PPC, Google Local Services Ads, and Meta campaigns — budgets, schedules, and performance."
        actions={
          <Button size="sm" disabled>
            <Plus className="mr-1 h-4 w-4" />
            Create ad
          </Button>
        }
      />

      <MarketingMetricGrid
        className="mb-8"
        columns={6}
        metrics={[
          { label: "Total spend (30d)" },
          { label: "Impressions" },
          { label: "Clicks" },
          { label: "CPC", hint: "Cost per click" },
          { label: "CPL", hint: "Cost per lead" },
          { label: "CTR" },
        ]}
      />

      <MarketingMetricGrid
        className="mb-8"
        columns={4}
        metrics={[
          { label: "Conversions" },
          { label: "Conversion rate" },
          { label: "ROAS", hint: "Return on ad spend" },
          { label: "Active campaigns" },
        ]}
      />

      <Tabs defaultValue="google-ppc" className="space-y-6">
        <TabsList>
          <TabsTrigger value="google-ppc">Google PPC</TabsTrigger>
          <TabsTrigger value="google-lsa">Google LSA</TabsTrigger>
          <TabsTrigger value="meta">Meta ads</TabsTrigger>
          <TabsTrigger value="budgets">Budgets &amp; schedules</TabsTrigger>
        </TabsList>

        <TabsContent value="google-ppc">
          <MarketingSectionCard
            title="Google Search &amp; Display campaigns"
            description="Search, display, and remarketing campaigns from Google Ads."
            action={<Badge variant="secondary">Integration coming soon</Badge>}
          >
            <MarketingEmptyTable
              columns={[
                "Campaign",
                "Status",
                "Budget",
                "Spend",
                "Impressions",
                "Clicks",
                "CPC",
                "Conversions",
                "ROAS",
              ]}
              message="Connect Google Ads to create campaigns, manage budgets, and view performance."
            />
          </MarketingSectionCard>
        </TabsContent>

        <TabsContent value="google-lsa">
          <MarketingSectionCard
            title="Google Local Services Ads"
            description="Pay-per-lead local service ads for qualified job requests."
            action={<Badge variant="secondary">Integration coming soon</Badge>}
          >
            <MarketingMetricGrid
              className="mb-6"
              columns={4}
              metrics={[
                { label: "Leads received" },
                { label: "Cost per lead" },
                { label: "Lead conversion rate" },
                { label: "Weekly budget" },
              ]}
            />
            <MarketingEmptyTable
              columns={["Service type", "Status", "Budget", "Leads", "CPL", "Booked jobs"]}
              message="Google LSA data will appear here once your Local Services account is linked."
            />
          </MarketingSectionCard>
        </TabsContent>

        <TabsContent value="meta">
          <MarketingSectionCard
            title="Meta ads (Facebook &amp; Instagram)"
            description="Paid social campaigns across Facebook and Instagram placements."
            action={<Badge variant="secondary">Integration coming soon</Badge>}
          >
            <MarketingEmptyTable
              columns={[
                "Campaign",
                "Objective",
                "Status",
                "Budget",
                "Spend",
                "Reach",
                "Clicks",
                "CPL",
                "ROAS",
              ]}
              message="Connect Meta Business Suite to manage and report on paid social campaigns."
            />
          </MarketingSectionCard>
        </TabsContent>

        <TabsContent value="budgets">
          <MarketingSectionCard
            title="Budgets &amp; schedules"
            description="Set daily or monthly caps and campaign run dates across all ad platforms."
          >
            <MarketingEmptyTable
              columns={[
                "Platform",
                "Campaign",
                "Budget type",
                "Amount",
                "Schedule",
                "Pacing",
                "Status",
              ]}
              message="Budget and schedule controls will be available when ad platform APIs are connected."
            />
          </MarketingSectionCard>
        </TabsContent>
      </Tabs>
    </ContentArea>
  );
}
