import Link from "next/link";
import { BarChart3, Globe, Mail } from "lucide-react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { SocialMetricsPlaceholder } from "@/components/marketing/SocialMetricsPlaceholder";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const comingSoon = [
  { title: "SEO tracking", description: "Monitor rankings and organic traffic." },
  { title: "Google Ads", description: "Campaign spend and conversion metrics." },
];

export default function MarketingOverviewPage() {
  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Marketing"]}
        title="Marketing"
        subtitle="Email & SMS campaigns, audience targeting, and performance insights."
        actions={
          <Button size="sm" asChild>
            <Link href="/marketing/campaigns/new">New campaign</Link>
          </Button>
        }
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
            <Mail className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Email & SMS campaigns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Build branded emails with AI, target customers by city, services, and tags, and run drip sequences.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link href="/marketing/campaigns">View campaigns</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/marketing/campaigns/new">Create campaign</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Campaign insights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Delivery, open, and click rates across all campaigns.</p>
            <Button size="sm" variant="outline" asChild>
              <Link href="/marketing/insights">View insights</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
            <Globe className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Google Business Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Impressions, calls, website clicks, and direction requests from your Google listing.</p>
            <Button size="sm" variant="outline" asChild>
              <Link href="/marketing/google-business">View performance</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Social metrics</h2>
      <div className="mb-8">
        <SocialMetricsPlaceholder />
      </div>

      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Coming soon</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {comingSoon.map((item) => (
          <Card key={item.title} className="opacity-70">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{item.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{item.description}</p>
              <p className="mt-2 text-xs font-medium text-muted-foreground">Coming soon</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </ContentArea>
  );
}
