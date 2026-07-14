import Link from "next/link";
import {
  BarChart3,
  Facebook,
  Globe,
  LineChart,
  Mail,
  Megaphone,
  Search,
  Users,
} from "lucide-react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { MarketingAttributionKpiStrip } from "@/components/marketing/MarketingAttributionKpiStrip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const modules = [
  {
    title: "Campaigns",
    description: "Email blasts, SMS, drips, and delivery/open/click insights in one place.",
    href: "/marketing/campaigns",
    icon: Mail,
    cta: "View campaigns",
  },
  {
    title: "Social media",
    description: "Facebook & Instagram posts, engagement, and content approval workflow.",
    href: "/marketing/social",
    icon: Facebook,
    cta: "Open social",
  },
  {
    title: "SEO",
    description: "Rankings, organic traffic, and technical health indicators.",
    href: "/marketing/seo",
    icon: Search,
    cta: "View SEO",
  },
  {
    title: "Paid ads",
    description: "Google PPC, Google LSA, and Meta — budgets, schedules, CPC, ROAS.",
    href: "/marketing/ads",
    icon: Megaphone,
    cta: "View ads",
  },
  {
    title: "Google Business Profile",
    description: "Impressions, calls, website clicks, and direction requests.",
    href: "/marketing/google-business",
    icon: Globe,
    cta: "View performance",
  },
  {
    title: "Referrals",
    description: "Customer referral program with share links, funnel tracking, and Stripe Connect payouts.",
    href: "/marketing/referrals",
    icon: Users,
    cta: "Manage referrals",
  },
];

export default function MarketingOverviewPage() {
  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Marketing"]}
        title="Marketing"
        subtitle="Campaigns, social, SEO, paid ads, and local presence."
        actions={
          <Button size="sm" asChild>
            <Link href="/marketing/campaigns/new">New campaign</Link>
          </Button>
        }
      />

      <MarketingAttributionKpiStrip />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.href}>
              <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                <Icon className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>{item.description}</p>
                <Button size="sm" variant="outline" asChild>
                  <Link href={item.href}>{item.cta}</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-dashed">
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <LineChart className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base text-muted-foreground">Reporting</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Website lead and funnel events are tracked in{" "}
            <Link href="/reporting/marketing" className="text-primary underline">
              Reporting → Marketing
            </Link>
            . Campaign performance lives under{" "}
            <Link href="/marketing/campaigns" className="text-primary underline">
              Campaigns
            </Link>
            .
          </p>
          <Button size="sm" variant="ghost" className="mt-3 px-0" asChild>
            <Link href="/reporting/marketing">
              <BarChart3 className="mr-1.5 h-4 w-4" />
              Marketing reports
            </Link>
          </Button>
        </CardContent>
      </Card>
    </ContentArea>
  );
}
