import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { requireSessionUser } from "@/lib/api-auth";
import { getMarketingReport } from "@/lib/marketing/queries";

export default async function MarketingReportingPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const user = await requireSessionUser();
  const params = await searchParams;
  const days = Math.min(90, Math.max(7, Number(params.days) || 30));

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);

  const report = await getMarketingReport(user.companyId, { from, to });

  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Reporting", "Marketing"]}
        title={`Website marketing events (last ${days} days)`}
      />
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-white p-6">
          <h2 className="font-medium mb-4">Events by type</h2>
          {report.byType.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {report.byType.map((row) => (
                <li key={row.eventType} className="flex justify-between text-sm">
                  <span>{row.eventType}</span>
                  <span className="font-medium">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-muted-foreground">Total: {report.total}</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-6">
          <h2 className="font-medium mb-4">Top pages</h2>
          {report.topPages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No page data yet.</p>
          ) : (
            <ul className="space-y-2">
              {report.topPages.map((row) => (
                <li key={row.pagePath} className="flex justify-between text-sm gap-4">
                  <span className="truncate font-mono text-xs">{row.pagePath}</span>
                  <span className="font-medium shrink-0">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </ContentArea>
  );
}
