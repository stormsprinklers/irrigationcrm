"use client";

import Link from "next/link";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LatePaymentAlert } from "@/components/maintenance-plans/LatePaymentAlert";
import {
  BILLING_FREQUENCY_LABELS,
  PLAN_VISIT_STATUS_LABELS,
  formatCurrency,
} from "@/lib/maintenance-plans/format";
import {
  enrollmentHasLatePayment,
  latePaymentSummary,
} from "@/lib/maintenance-plans/late-payment";
import type { EnrollmentDTO, PlanVisitDTO } from "@/lib/maintenance-plans/types";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

type Props = {
  enrollments: EnrollmentDTO[];
  onEnroll: () => void;
};

type VisitRow = {
  enrollment: EnrollmentDTO;
  visit: PlanVisitDTO;
};

function visitStatusVariant(status: string) {
  if (status === "OVERDUE") return "destructive" as const;
  if (status === "COMPLETED") return "success" as const;
  if (status === "SCHEDULED") return "default" as const;
  return "outline" as const;
}

function visitRows(enrollments: EnrollmentDTO[]): VisitRow[] {
  return enrollments
    .flatMap((enrollment) =>
      (enrollment.planVisits ?? []).map((visit) => ({ enrollment, visit }))
    )
    .sort((a, b) => {
      if (a.visit.dueYear !== b.visit.dueYear) return a.visit.dueYear - b.visit.dueYear;
      if (a.visit.dueMonth !== b.visit.dueMonth) return a.visit.dueMonth - b.visit.dueMonth;
      return a.visit.status.localeCompare(b.visit.status);
    });
}

export function CustomerMaintenancePlansTab({ enrollments, onEnroll }: Props) {
  const lateEnrollments = enrollments.filter(enrollmentHasLatePayment);
  const latePeriods = lateEnrollments.flatMap((e) => e.billingPeriods ?? []);
  const lateSummary = latePaymentSummary(latePeriods);
  const rows = visitRows(enrollments);
  const overdueCount = rows.filter((row) => row.visit.status === "OVERDUE").length;
  const unscheduledCount = rows.filter((row) => row.visit.status === "UNSCHEDULED").length;
  const scheduledCount = rows.filter((row) => row.visit.status === "SCHEDULED").length;
  const completedCount = rows.filter((row) => row.visit.status === "COMPLETED").length;
  const skippedCount = rows.filter((row) => row.visit.status === "SKIPPED").length;
  const visitSummary = [
    overdueCount ? `${overdueCount} overdue` : null,
    unscheduledCount ? `${unscheduledCount} unscheduled` : null,
    scheduledCount ? `${scheduledCount} scheduled` : null,
    completedCount ? `${completedCount} completed` : null,
    skippedCount ? `${skippedCount} skipped` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-4">
      {lateEnrollments.length > 0 ? (
        <LatePaymentAlert
          title={
            lateEnrollments.length === 1
              ? "Late on maintenance plan payment"
              : "Late on maintenance plan payments"
          }
          amount={lateSummary.total}
          description={
            lateSummary.count === 1
              ? `${lateEnrollments[0].template.name} has an overdue billing period.`
              : `${lateSummary.count} billing periods are overdue across ${lateEnrollments.length} plans.`
          }
        />
      ) : null}

      <div className="flex justify-end">
        <Button type="button" onClick={onEnroll}>
          <Plus className="h-4 w-4" />
          Enroll in plan
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Enrollments</CardTitle>
        </CardHeader>
        <CardContent>
          {enrollments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No maintenance plan enrollments.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Billing</TableHead>
                  <TableHead>Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollments.map((enrollment) => {
                  const late = enrollmentHasLatePayment(enrollment);
                  return (
                    <TableRow
                      key={enrollment.id}
                      className={late ? "bg-red-50/80 dark:bg-red-950/20" : undefined}
                    >
                      <TableCell>
                        <div className="space-y-1">
                          <Link
                            href={`/maintenance-plans/enrollments/${enrollment.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {enrollment.template.name}
                          </Link>
                          {late ? (
                            <Badge variant="destructive" className="text-[10px]">
                              Late payment
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{enrollment.property.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{enrollment.status.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell>
                        {BILLING_FREQUENCY_LABELS[enrollment.billingFrequency]}
                      </TableCell>
                      <TableCell>{formatCurrency(enrollment.template.basePrice)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan visits</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {enrollments.length === 0
                ? "Enroll this customer in a plan to see scheduled and completed visits."
                : "Visits will appear after the plan is activated."}
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {visitSummary || `${rows.length} plan visit${rows.length === 1 ? "" : "s"}`}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Visit</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Scheduled</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ enrollment, visit }) => (
                    <TableRow
                      key={visit.id}
                      className={
                        visit.status === "OVERDUE"
                          ? "bg-red-50/80 dark:bg-red-950/20"
                          : undefined
                      }
                    >
                      <TableCell className="font-medium">
                        {visit.visit ? (
                          <Link
                            href={`/visits/${visit.visit.id}`}
                            className="text-primary hover:underline"
                          >
                            {visit.visitTemplate?.visitTitle ?? visit.visit.title}
                          </Link>
                        ) : (
                          (visit.visitTemplate?.visitTitle ?? "Maintenance visit")
                        )}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/maintenance-plans/enrollments/${enrollment.id}`}
                          className="text-primary hover:underline"
                        >
                          {enrollment.template.name}
                        </Link>
                      </TableCell>
                      <TableCell>{enrollment.property.name}</TableCell>
                      <TableCell>
                        {MONTHS[visit.dueMonth - 1]} {visit.dueYear}
                      </TableCell>
                      <TableCell>
                        <Badge variant={visitStatusVariant(visit.status)}>
                          {PLAN_VISIT_STATUS_LABELS[visit.status] ?? visit.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {visit.visit ? (
                          <Link
                            href={`/visits/${visit.visit.id}`}
                            className="text-primary hover:underline"
                          >
                            {format(new Date(visit.visit.startAt), "MMM d, yyyy")}
                          </Link>
                        ) : visit.completedAt ? (
                          format(new Date(visit.completedAt), "MMM d, yyyy")
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
