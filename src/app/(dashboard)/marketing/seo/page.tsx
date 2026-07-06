import { Suspense } from "react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { SearchConsolePanel } from "@/components/marketing/SearchConsolePanel";
import { SeoRecommendationsPanel } from "@/components/marketing/SeoRecommendationsPanel";
import { SerpRankingPanel } from "@/components/marketing/SerpRankingPanel";
import { WebsiteAnalyticsPanel } from "@/components/marketing/WebsiteAnalyticsPanel";

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

      <div className="mb-8">
        <SeoRecommendationsPanel />
      </div>

      <div className="mb-8">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading website analytics...</p>}>
          <WebsiteAnalyticsPanel />
        </Suspense>
      </div>

      <div className="mb-8">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading Search Console...</p>}>
          <SearchConsolePanel />
        </Suspense>
      </div>
    </ContentArea>
  );
}
