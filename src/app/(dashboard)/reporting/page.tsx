import { ReportCategoryCard } from "@/components/reporting/ReportCategoryCard";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { jobsReportCategories } from "@/lib/mock/reporting-catalog";
import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";

export default function ReportingPage() {
  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Reporting", "Jobs"]}
        title="Jobs"
        actions={
          <>
            <Link href="#" className="text-sm font-medium text-primary hover:underline">
              Advanced reporting
            </Link>
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4" />
              Create report
            </Button>
            <Button variant="outline" size="sm">
              <Sparkles className="h-4 w-4 text-purple-500" />
              Ask Analyst AI
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {jobsReportCategories.map((category) => (
          <ReportCategoryCard key={category.title} category={category} />
        ))}
      </div>
    </ContentArea>
  );
}
