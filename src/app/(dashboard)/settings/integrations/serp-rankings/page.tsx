import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { SerpRankingsSettings } from "@/components/settings/SerpRankingsSettings";

export default function SerpRankingsSettingsPage() {
  return (
    <ContentArea className="max-w-4xl">
      <PageHeader
        title="Search rankings"
        subtitle="Keywords, website URL, and Utah locations for GBP local pack and organic SEO maps."
      />
      <SerpRankingsSettings />
    </ContentArea>
  );
}
