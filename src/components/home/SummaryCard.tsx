import type { HomeKpi, HomeSummaryCard } from "@/lib/home/types";
import { ClipboardList, FileText, Plus, Wrench } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const iconMap: Record<string, React.ReactNode> = {
  Estimates: <ClipboardList className="h-5 w-5 text-muted-foreground" />,
  Jobs: <Wrench className="h-5 w-5 text-muted-foreground" />,
  Visits: <Wrench className="h-5 w-5 text-muted-foreground" />,
  Invoices: <FileText className="h-5 w-5 text-muted-foreground" />,
};

export function SummaryCard({ data }: { data: HomeSummaryCard }) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          {iconMap[data.title]}
          <CardTitle className="text-base font-semibold">{data.title}</CardTitle>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link href={data.href}>
            <Plus className="h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="flex-1">
        {data.highlight ? (
          <div className="rounded-lg bg-highlight-panel p-4">
            <p className="text-sm font-medium text-primary">{data.highlight.label}</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{data.highlight.value}</p>
          </div>
        ) : (
          <div className="rounded-lg bg-highlight p-4">
            <p className="text-sm text-muted-foreground">{data.emptyMessage}</p>
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-0">
        <Link href={data.href} className="text-sm font-medium text-primary hover:underline">
          {data.linkLabel}
        </Link>
      </CardFooter>
    </Card>
  );
}

export type { HomeKpi, HomeSummaryCard };
