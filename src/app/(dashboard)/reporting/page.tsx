import Link from "next/link";
import { ReportCategoryCard } from "@/components/reporting/ReportCategoryCard";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { JOBS_REPORT_CATEGORIES } from "@/lib/reporting/queries";
import { Plus } from "lucide-react";

export default function ReportingPage() {
  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Reporting", "Jobs"]}
        title="Jobs"
        actions={
          <>
            <Link href="/reporting/insights" className="text-sm font-medium text-primary hover:underline">
              Advanced reporting
            </Link>
            <Button variant="outline" size="sm" asChild>
              <Link href="/reporting/custom">
                <Plus className="h-4 w-4" />
                Create report
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {JOBS_REPORT_CATEGORIES.map((category) => (
          <ReportCategoryCard key={category.title} category={category} />
        ))}
      </div>
    </ContentArea>
  );
}
