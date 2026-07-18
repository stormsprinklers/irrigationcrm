import type { BillingRowDisplay } from "@/lib/maintenance-plans/format";
import { formatBillingStatus, formatCurrency } from "@/lib/maintenance-plans/format";
import { isBillingPeriodLate } from "@/lib/maintenance-plans/late-payment";
import { LatePaymentAlert } from "@/components/maintenance-plans/LatePaymentAlert";
import { format } from "date-fns";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function DueForBillingCard({ rows }: { rows: BillingRowDisplay[] }) {
  const lateRows = rows.filter((row) =>
    isBillingPeriodLate({ status: row.status, dueDate: row.dueDate, paidAt: null })
  );
  const lateTotal = lateRows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold">Due for billing</CardTitle>
        <Link href="/maintenance-plans/billing" className="text-sm text-primary hover:underline">
          View more
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {lateRows.length > 0 ? (
          <LatePaymentAlert
            title={
              lateRows.length === 1
                ? "1 customer is late on payment"
                : `${lateRows.length} customers are late on payment`
            }
            amount={lateTotal}
            description="Failed charges and past-due billing periods need attention."
          />
        ) : null}

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No billing due at this time.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const late = isBillingPeriodLate({
                  status: row.status,
                  dueDate: row.dueDate,
                  paidAt: null,
                });
                return (
                  <TableRow
                    key={row.id}
                    className={late ? "bg-red-50/80 dark:bg-red-950/20" : undefined}
                  >
                    <TableCell className="font-medium">
                      <div className="space-y-1">
                        {row.enrollmentId ? (
                          <Link
                            href={`/maintenance-plans/enrollments/${row.enrollmentId}`}
                            className="text-primary hover:underline"
                          >
                            {row.customer}
                          </Link>
                        ) : (
                          row.customer
                        )}
                        {late ? (
                          <Badge variant="destructive" className="text-[10px]">
                            Late
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{row.phone ?? "—"}</TableCell>
                    <TableCell>{format(new Date(row.dueDate), "MMM d, yyyy")}</TableCell>
                    <TableCell className={late ? "font-medium text-red-700" : "text-primary"}>
                      {late && row.status === "FAILED"
                        ? "Failed"
                        : late
                          ? "Past due"
                          : formatBillingStatus(row.status)}
                    </TableCell>
                    <TableCell>{formatCurrency(row.amount)}</TableCell>
                    <TableCell>
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
