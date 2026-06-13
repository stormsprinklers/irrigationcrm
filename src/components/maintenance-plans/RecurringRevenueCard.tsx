import { formatCurrency } from "@/lib/maintenance-plans/format";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function RecurringRevenueCard({
  items,
}: {
  items: { month: string; amount: number }[];
}) {
  const maxAmount = Math.max(...items.map((i) => i.amount), 1);
  const barHeights = items.map((item) => Math.max(8, Math.round((item.amount / maxAmount) * 100)));

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold">Recurring revenue</CardTitle>
        <Link href="/reporting/service-plans" className="text-sm text-primary hover:underline">
          View reporting
        </Link>
      </CardHeader>
      <CardContent>
        <ul className="mb-4 space-y-1 text-sm">
          {items.map((item) => (
            <li key={item.month}>
              <span className="font-medium">{formatCurrency(item.amount)}</span> in {item.month}
            </li>
          ))}
        </ul>
        <div className="flex h-24 items-end gap-1">
          {barHeights.map((height, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-green-500/80"
              style={{ height: `${height}%` }}
              title={items[i] ? `${items[i].month}: ${formatCurrency(items[i].amount)}` : undefined}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
