"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BILLING_FREQUENCY_LABELS, formatCurrency } from "@/lib/maintenance-plans/format";
import { latePaymentSummary } from "@/lib/maintenance-plans/late-payment";
import { LatePaymentAlert } from "@/components/maintenance-plans/LatePaymentAlert";
import { CustomerNameWithBadge } from "@/components/customers/CustomerNameWithBadge";
import type { EnrollmentDTO } from "@/lib/maintenance-plans/types";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type Props = {
  enrollment: EnrollmentDTO;
  onUpdated: (enrollment: EnrollmentDTO) => void;
};

export function EnrollmentDetail({ enrollment, onUpdated }: Props) {
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [acting, setActing] = useState(false);

  async function acceptEnrollment() {
    setActing(true);
    try {
      const res = await fetch(`/api/maintenance-plans/enrollments/${enrollment.id}/accept`, {
        method: "POST",
      });
      if (!res.ok) {
        toast.error("Failed to activate enrollment");
        return;
      }
      onUpdated(await res.json());
      toast.success("Enrollment activated");
    } finally {
      setActing(false);
    }
  }

  async function cancelEnrollment() {
    setActing(true);
    try {
      const res = await fetch(`/api/maintenance-plans/enrollments/${enrollment.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancellationReason: cancelReason || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Failed to cancel enrollment");
        return;
      }
      onUpdated(await res.json());
      setShowCancel(false);
      setCancelReason("");
      toast.success("Enrollment cancelled");
    } finally {
      setActing(false);
    }
  }

  const canAccept = enrollment.status === "DRAFT" || enrollment.status === "SENT";
  const canCancel =
    enrollment.status !== "CANCELLED" && enrollment.status !== "DRAFT";
  const late = latePaymentSummary(enrollment.billingPeriods ?? []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{enrollment.template.name}</h1>
          <p className="text-muted-foreground">
            <CustomerNameWithBadge
              name={enrollment.customer.name}
              doNotService={enrollment.customer.doNotService}
            />{" "}
            · {enrollment.property.name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{enrollment.status.replace(/_/g, " ")}</Badge>
          {canAccept && (
            <Button onClick={acceptEnrollment} disabled={acting}>
              Accept & activate
            </Button>
          )}
          {canCancel && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setShowCancel(true)}
              disabled={acting}
            >
              Cancel plan
            </Button>
          )}
        </div>
      </div>

      {late.count > 0 ? (
        <LatePaymentAlert
          title="Late on payment"
          amount={late.total}
          description={
            late.count === 1
              ? `Billing was due ${format(new Date(late.periods[0].dueDate), "MMM d, yyyy")}.`
              : `${late.count} billing periods are overdue or failed.`
          }
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Billing</p>
            <p className="font-medium">{BILLING_FREQUENCY_LABELS[enrollment.billingFrequency]}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Start date</p>
            <p className="font-medium">{format(new Date(enrollment.startDate), "MMM d, yyyy")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Next billing</p>
            <p className="font-medium">
              {enrollment.nextBillingDate
                ? format(new Date(enrollment.nextBillingDate), "MMM d, yyyy")
                : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Annual price</p>
            <p className="font-medium">{formatCurrency(enrollment.template.basePrice)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Visit timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {!enrollment.planVisits?.length ? (
            <p className="text-sm text-muted-foreground">
              Visits will appear after the plan is activated.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Visit</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Scheduled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollment.planVisits.map((pv) => (
                  <TableRow key={pv.id}>
                    <TableCell>{pv.visitTemplate?.visitTitle ?? "Maintenance visit"}</TableCell>
                    <TableCell>
                      {MONTHS[pv.dueMonth - 1]} {pv.dueYear}
                    </TableCell>
                    <TableCell>
                      <Badge variant={pv.status === "OVERDUE" ? "destructive" : "outline"}>
                        {pv.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {pv.visit ? (
                        <Link href={`/visits/${pv.visit.id}`} className="text-primary hover:underline">
                          {format(new Date(pv.visit.startAt), "MMM d, yyyy")}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Billing history</CardTitle>
        </CardHeader>
        <CardContent>
          {!enrollment.billingPeriods?.length ? (
            <p className="text-sm text-muted-foreground">No billing periods yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollment.billingPeriods.map((bp) => {
                  const periodLate = late.periods.some((p) => p.id === bp.id);
                  return (
                  <TableRow
                    key={bp.id}
                    className={periodLate ? "bg-red-50/80 dark:bg-red-950/20" : undefined}
                  >
                    <TableCell>
                      {format(new Date(bp.periodStart), "MMM d")} –{" "}
                      {format(new Date(bp.periodEnd), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>{format(new Date(bp.dueDate), "MMM d, yyyy")}</TableCell>
                    <TableCell>{formatCurrency(bp.amount)}</TableCell>
                    <TableCell>
                      <Badge variant={periodLate ? "destructive" : "outline"}>
                        {periodLate && bp.status === "FAILED"
                          ? "FAILED"
                          : periodLate
                            ? "PAST DUE"
                            : bp.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showCancel && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => !acting && setShowCancel(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Cancel enrollment</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This will cancel {enrollment.template.name} for {enrollment.customer.name}. Pending
                  billing periods will be closed out.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={acting}
                onClick={() => setShowCancel(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Reason (optional)</label>
                <Input
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Customer requested cancellation"
                  disabled={acting}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="destructive" onClick={cancelEnrollment} disabled={acting}>
                  {acting ? "Cancelling..." : "Confirm cancellation"}
                </Button>
                <Button variant="outline" onClick={() => setShowCancel(false)} disabled={acting}>
                  Keep plan
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
