import type { BillingRowDisplay } from "@/lib/maintenance-plans/format";
import { formatBillingStatus, formatCurrency } from "@/lib/maintenance-plans/format";
import { format } from "date-fns";
import Link from "next/link";
import { CreditCard } from "lucide-react";
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
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold">Due for billing</CardTitle>
        <Link href="/maintenance-plans/billing" className="text-sm text-primary hover:underline">
          View more
        </Link>
      </CardHeader>
      <CardContent>
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
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.customer}</TableCell>
                  <TableCell>{row.phone ?? "—"}</TableCell>
                  <TableCell>{format(new Date(row.dueDate), "MMM d, yyyy")}</TableCell>
                  <TableCell className="text-primary">{formatBillingStatus(row.status)}</TableCell>
                  <TableCell>{formatCurrency(row.amount)}</TableCell>
                  <TableCell>
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
