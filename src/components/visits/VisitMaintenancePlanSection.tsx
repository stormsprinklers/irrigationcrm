"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Shield, Wrench } from "lucide-react";
import { toast } from "sonner";
import { EnrollPlanModal } from "@/components/maintenance-plans/EnrollPlanModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BILLING_FREQUENCY_LABELS, formatCurrency } from "@/lib/maintenance-plans/format";
import type {
  EnrollmentSummary,
  LinkedPlanVisit,
  VisitMaintenanceContext,
} from "@/lib/maintenance-plans/visit-context";
import type { CustomerPropertyDTO } from "@/lib/customers/types";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type Props = {
  visitId: string;
  customerId: string | null;
  propertyId: string | null;
  onUpdated?: () => void;
};

function formatDueMonth(year: number, month: number) {
  return `${MONTHS[month - 1] ?? month} ${year}`;
}

export function VisitMaintenancePlanSection({ visitId, customerId, propertyId, onUpdated }: Props) {
  const [context, setContext] = useState<VisitMaintenanceContext | null>(null);
  const [properties, setProperties] = useState<CustomerPropertyDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlanVisitId, setSelectedPlanVisitId] = useState("");
  const [linking, setLinking] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/visits/${visitId}/maintenance-plan`);
    if (res.ok) {
      const data = (await res.json()) as VisitMaintenanceContext;
      setContext(data);
      setSelectedPlanVisitId((prev) => {
        if (prev && data.assignablePlanVisits.some((v) => v.id === prev)) return prev;
        return data.assignablePlanVisits[0]?.id ?? "";
      });
    }
  }, [visitId]);

  useEffect(() => {
    load()
      .catch(() => toast.error("Failed to load maintenance plan info"))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!customerId) return;
    fetch(`/api/customers/${customerId}/properties`)
      .then((r) => r.json())
      .then((data) => setProperties(Array.isArray(data) ? data : []))
      .catch(() => setProperties([]));
  }, [customerId]);

  async function handleAssign() {
    if (!selectedPlanVisitId) {
      toast.error("Select a plan visit to assign");
      return;
    }

    setLinking(true);
    try {
      const res = await fetch(`/api/visits/${visitId}/maintenance-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planVisitId: selectedPlanVisitId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Failed to assign plan visit");
        return;
      }
      setContext(await res.json());
      toast.success("Maintenance plan visit assigned");
      onUpdated?.();
    } finally {
      setLinking(false);
    }
  }

  async function openEnrollModal() {
    if (!customerId) return;

    if (properties.length === 0) {
      const customerRes = await fetch(`/api/customers/${customerId}`);
      if (!customerRes.ok) {
        toast.error("Could not load customer for enrollment");
        return;
      }
      const customer = await customerRes.json();
      const hasAddress = Boolean(customer.address || customer.city || customer.zip);
      if (!hasAddress) {
        toast.error("Add a property on the customer profile before enrolling in a plan.");
        return;
      }

      const res = await fetch(`/api/customers/${customerId}/properties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Primary",
          address: customer.address,
          city: customer.city,
          state: customer.state,
          zip: customer.zip,
          isPrimary: true,
        }),
      });
      if (!res.ok) {
        toast.error("Add a property before enrolling in a plan.");
        return;
      }
      setProperties([await res.json()]);
    }

    setEnrollOpen(true);
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            Maintenance plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (!customerId) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            Maintenance plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Assign a customer to this visit to view or link maintenance plan information.
          </p>
        </CardContent>
      </Card>
    );
  }

  const linked = context?.linked ?? null;
  const enrollments = context?.enrollments ?? [];
  const assignable = context?.assignablePlanVisits ?? [];
  const hasActiveEnrollment = enrollments.length > 0;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            Maintenance plan
          </CardTitle>
          {!linked && !hasActiveEnrollment && (
            <Button type="button" size="sm" variant="outline" onClick={openEnrollModal}>
              <Plus className="h-4 w-4" />
              Enroll in plan
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {linked ? (
            <LinkedPlanVisitPanel linked={linked} />
          ) : (
            <>
              {hasActiveEnrollment ? (
                <ActiveEnrollmentsPanel enrollments={enrollments} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  This customer is not enrolled in a maintenance plan
                  {propertyId ? " for this property" : ""}.
                </p>
              )}

              {assignable.length > 0 && (
                <div className="space-y-2 rounded-lg border border-dashed p-3">
                  <p className="text-sm font-medium">Assign plan visit to this job</p>
                  <p className="text-xs text-muted-foreground">
                    Link an included seasonal visit from their active plan. Plan discounts will be applied automatically.
                  </p>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={selectedPlanVisitId}
                    onChange={(e) => setSelectedPlanVisitId(e.target.value)}
                  >
                    {assignable.map((pv) => (
                      <option key={pv.id} value={pv.id}>
                        {pv.visitTitle} · {formatDueMonth(pv.dueYear, pv.dueMonth)} · {pv.planName}
                      </option>
                    ))}
                  </select>
                  <Button type="button" size="sm" onClick={handleAssign} disabled={linking || !selectedPlanVisitId}>
                    <Wrench className="h-4 w-4" />
                    {linking ? "Assigning..." : "Assign to this visit"}
                  </Button>
                </div>
              )}

              {hasActiveEnrollment && assignable.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  All included plan visits for this enrollment are already scheduled or completed.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {customerId && (
        <EnrollPlanModal
          key={customerId}
          customerId={customerId}
          properties={properties}
          open={enrollOpen}
          onClose={() => setEnrollOpen(false)}
          onEnrolled={() => {
            load().then(() => onUpdated?.());
          }}
        />
      )}
    </>
  );
}

function LinkedPlanVisitPanel({ linked }: { linked: LinkedPlanVisit }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Plan visit</Badge>
        <Badge variant="outline">{linked.status.replace(/_/g, " ")}</Badge>
        {linked.season && linked.season !== "CUSTOM" && (
          <Badge variant="outline">{linked.season}</Badge>
        )}
      </div>
      <p className="font-medium">{linked.visitTitle}</p>
      <p className="text-sm text-muted-foreground">
        Due {formatDueMonth(linked.dueYear, linked.dueMonth)}
      </p>
      <div className="rounded-md bg-muted/50 p-3 text-sm">
        <p>
          <span className="text-muted-foreground">Plan:</span>{" "}
          <Link
            href={`/maintenance-plans/enrollments/${linked.enrollment.id}`}
            className="font-medium text-primary hover:underline"
          >
            {linked.enrollment.templateName}
          </Link>
        </p>
        <p className="mt-1">
          <span className="text-muted-foreground">Property:</span> {linked.enrollment.propertyName}
        </p>
        <p className="mt-1">
          <span className="text-muted-foreground">Enrollment:</span>{" "}
          {linked.enrollment.status.replace(/_/g, " ")}
        </p>
      </div>
    </div>
  );
}

function ActiveEnrollmentsPanel({ enrollments }: { enrollments: EnrollmentSummary[] }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Active enrollment{enrollments.length > 1 ? "s" : ""}</p>
      <div className="space-y-2">
        {enrollments.map((enrollment) => (
          <div key={enrollment.id} className="rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/maintenance-plans/enrollments/${enrollment.id}`}
                className="font-medium text-primary hover:underline"
              >
                {enrollment.templateName}
              </Link>
              <Badge variant="outline">{enrollment.status.replace(/_/g, " ")}</Badge>
            </div>
            <p className="mt-1 text-muted-foreground">{enrollment.propertyName}</p>
            <p className="mt-1 text-muted-foreground">
              {BILLING_FREQUENCY_LABELS[enrollment.billingFrequency]} · {formatCurrency(enrollment.basePrice)}
            </p>
            {enrollment.unscheduledVisitCount > 0 && (
              <p className="mt-1 text-xs text-primary">
                {enrollment.unscheduledVisitCount} visit
                {enrollment.unscheduledVisitCount === 1 ? "" : "s"} ready to assign
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
