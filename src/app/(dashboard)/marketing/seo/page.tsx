import { Suspense } from "react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { GoogleAnalyticsPanel } from "@/components/marketing/GoogleAnalyticsPanel";
import { SearchConsolePanel } from "@/components/marketing/SearchConsolePanel";
import { SerpRankingPanel } from "@/components/marketing/SerpRankingPanel";

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
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading Search Console...</p>}>
          <SearchConsolePanel />
        </Suspense>
      </div>

      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading Google Analytics...</p>}>
        <GoogleAnalyticsPanel />
      </Suspense>
    </ContentArea>
  );
}
