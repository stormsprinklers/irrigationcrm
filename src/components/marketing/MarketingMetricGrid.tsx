import { CircleHelp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type MarketingMetric = {
  label: string;
  value?: string | number;
  hint?: string;
  tooltip?: string;
};

type Props = {
  metrics: MarketingMetric[];
  columns?: 2 | 3 | 4 | 5 | 6 | 7;
  className?: string;
  comingSoon?: boolean;
};

export function MarketingMetricGrid({
  metrics,
  columns = 4,
  className,
  comingSoon = true,
}: Props) {
  const colClass = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
    5: "sm:grid-cols-2 lg:grid-cols-5",
    6: "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
    7: "sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7",
  }[columns];

  return (
    <div className={cn("grid gap-4", colClass, className)}>
      {metrics.map((metric) => (
        <div key={metric.label} className="rounded-lg border border-border bg-white p-4">
          <div className="mb-1 flex items-start justify-between gap-2">
            <p className="text-2xl font-semibold text-foreground">
              {metric.value ?? "—"}
            </p>
            {comingSoon && !metric.value ? (
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                Soon
              </Badge>
            ) : null}
          </div>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <span>{metric.label}</span>
            {metric.tooltip ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex text-muted-foreground/80 hover:text-foreground"
                    aria-label={`About ${metric.label}`}
                  >
                    <CircleHelp className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{metric.tooltip}</TooltipContent>
              </Tooltip>
            ) : null}
          </p>
          {metric.hint ? (
            <p className="mt-1 text-xs text-muted-foreground/80">{metric.hint}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function MarketingSectionCard({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="font-medium">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function MarketingEmptyTable({
  columns,
  message,
}: {
  columns: string[];
  message: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            {columns.map((col) => (
              <th key={col} className="px-3 py-2 font-medium">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">
              {message}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
