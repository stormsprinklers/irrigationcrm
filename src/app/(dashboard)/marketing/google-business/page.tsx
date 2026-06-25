import { Suspense } from "react";
import Link from "next/link";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { GoogleBusinessProfilePanel } from "@/components/marketing/GoogleBusinessProfilePanel";
import { GbpLocalRankingPanel } from "@/components/marketing/GbpLocalRankingPanel";

export default function GoogleBusinessMarketingPage() {
  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Marketing", "Google Business Profile"]}
        title="Google Business Profile"
        subtitle="Track local visibility, calls, website clicks, direction requests, and geographic local pack rankings."
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link href="/marketing">Back to marketing</Link>
          </Button>
        }
      />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading...</p>}>
        <GoogleBusinessProfilePanel />
      </Suspense>
      <div className="mt-8">
        <GbpLocalRankingPanel />
      </div>
    </ContentArea>
  );
}
