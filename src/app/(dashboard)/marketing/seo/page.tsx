import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  MarketingEmptyTable,
  MarketingMetricGrid,
  MarketingSectionCard,
} from "@/components/marketing/MarketingMetricGrid";
import { SerpRankingPanel } from "@/components/marketing/SerpRankingPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function MarketingSeoPage() {
  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Marketing", "SEO"]}
        title="SEO"
        subtitle="Organic search visibility, rankings, and site health."
      />

      <div className="mb-8">
        <SerpRankingPanel variant="organic" />
      </div>

      <MarketingMetricGrid
        className="mb-8"
        columns={6}
        metrics={[
          { label: "Organic sessions (30d)" },
          { label: "Organic conversions" },
          { label: "Avg. keyword position" },
          { label: "Search impressions" },
          { label: "Search CTR" },
          { label: "Indexed pages" },
        ]}
      />

      <Tabs defaultValue="pages" className="space-y-6">
        <TabsList>
          <TabsTrigger value="pages">Top pages</TabsTrigger>
          <TabsTrigger value="technical">Technical health</TabsTrigger>
        </TabsList>

        <TabsContent value="pages">
          <MarketingSectionCard
            title="Top landing pages"
            description="Organic traffic and engagement by page."
          >
            <MarketingEmptyTable
              columns={["Page", "Sessions", "Conversions", "Bounce rate", "Avg. time"]}
              message="Page-level SEO data will appear here after Search Console is connected."
            />
          </MarketingSectionCard>
        </TabsContent>

        <TabsContent value="technical">
          <MarketingSectionCard
            title="Technical SEO"
            description="Core Web Vitals, crawl issues, and on-page health indicators."
          >
            <MarketingMetricGrid
              className="mb-6"
              columns={4}
              metrics={[
                { label: "Core Web Vitals", hint: "LCP, INP, CLS" },
                { label: "Mobile usability" },
                { label: "Crawl errors" },
                { label: "Sitemap status" },
              ]}
            />
            <MarketingEmptyTable
              columns={["Issue", "Severity", "Affected URLs", "Status"]}
              message="Technical SEO issues will be surfaced here once monitoring is enabled."
            />
          </MarketingSectionCard>
        </TabsContent>
      </Tabs>
    </ContentArea>
  );
}
