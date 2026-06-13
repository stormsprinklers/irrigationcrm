import { CompanyProfile } from "@/components/settings/CompanyProfile";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { companyDescription, companyInfo } from "@/lib/mock/settings-company";
import { cn } from "@/lib/utils";

const profileTabs = ["Profile", "Business hours", "Service area"];

export default function SettingsPage() {
  return (
    <ContentArea className="max-w-4xl">
      <PageHeader title="Company" />

      <div className="mb-6 flex gap-6 border-b border-border">
        {profileTabs.map((tab, index) => (
          <button
            key={tab}
            type="button"
            className={cn(
              "relative pb-3 text-sm font-medium transition-colors",
              index === 0
                ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      <CompanyProfile fields={companyInfo} description={companyDescription} />
    </ContentArea>
  );
}
