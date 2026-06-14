import type { HomeDateRange, HomeKpi } from "@/lib/home/types";
import { ChevronDown, Info, MoreVertical } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";

const RANGE_LABELS: Record<HomeDateRange, string> = {
  ytd: "Year to date",
  mtd: "Month to date",
  last30: "Last 30 days",
};

type KpiStripProps = {
  metrics: HomeKpi[];
  range?: HomeDateRange;
  onRangeChange?: (range: HomeDateRange) => void;
};

export function KpiStrip({ metrics, range = "ytd", onRangeChange }: KpiStripProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-2 text-lg font-semibold">
              {RANGE_LABELS[range]}
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {(Object.keys(RANGE_LABELS) as HomeDateRange[]).map((key) => (
              <DropdownMenuItem key={key} onClick={() => onRangeChange?.(key)}>
                {RANGE_LABELS[key]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex items-center gap-2">
          <Link href="/reporting" className="text-sm font-medium text-primary hover:underline">
            View all reports
          </Link>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 divide-y md:grid-cols-5 md:divide-x md:divide-y-0">
          {metrics.map((metric, index) => (
            <div key={metric.label} className="flex flex-col px-0 py-4 md:px-6 md:py-0">
              {index > 0 && <Separator className="mb-4 md:hidden" />}
              <div className="mb-2 flex items-center gap-1">
                <span className="text-sm text-muted-foreground">{metric.label}</span>
                <Info className="h-3.5 w-3.5 text-muted-foreground/60" />
              </div>
              <p className="text-2xl font-semibold tracking-tight">{metric.value}</p>
              {metric.change !== "—" && (
                <Badge variant="success" className="mt-2 w-fit">
                  ↑ {metric.change}
                </Badge>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
