import Link from "next/link";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { REPORT_LINKS } from "@/lib/reporting/queries";

export default function ReportingCustomPage() {
  return (
    <ContentArea>
      <PageHeader breadcrumb={["Reporting", "Custom"]} title="Custom reports" />
      <p className="mb-4 text-sm text-muted-foreground">
        Quick links to saved report presets. Use these as starting points for common views.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REPORT_LINKS.map((link) => (
          <Card key={link.href}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{link.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <Link href={link.href} className="text-sm font-medium text-primary hover:underline">
                Open report
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </ContentArea>
  );
}
