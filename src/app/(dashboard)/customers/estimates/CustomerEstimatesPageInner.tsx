"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { CustomerNameWithBadge } from "@/components/customers/CustomerNameWithBadge";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useHolidayLightingFeatures } from "@/components/layout/CompanyBrandProvider";
import { holidayEstimateWizardUrl } from "@/lib/holiday-lighting/routes";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export default function CustomerEstimatesPageInner() {
  const searchParams = useSearchParams();
  const {
    enabled: holidayLightingEnabled,
    loading: holidayLightingFeaturesLoading,
  } = useHolidayLightingFeatures();
  const visitId = searchParams.get("visitId");
  const [estimates, setEstimates] = useState<
    Array<{
      id: string;
      estimateNumber?: string | null;
      displayNumber?: string | null;
      optionCount?: number;
      status: string;
      total: number;
      createdAt: string;
      customer: { id: string; name: string; doNotService?: boolean };
    }>
  >([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    fetch(`/api/estimates${params}`)
      .then((r) => r.json())
      .then((data) => setEstimates(data.estimates ?? []))
      .catch(() => toast.error("Failed to load estimates"))
      .finally(() => setLoading(false));
  }, [search]);

  async function createFromVisit() {
    if (!visitId) return;
    const visitRes = await fetch(`/api/visits/${visitId}`);
    if (!visitRes.ok) {
      toast.error("Visit not found");
      return;
    }
    const visit = await visitRes.json();
    if (!visit.customer?.id) {
      toast.error("Visit must have a customer");
      return;
    }
    if (holidayLightingEnabled) {
      window.location.href = holidayEstimateWizardUrl({
        customerId: visit.customer.id,
        customerName: visit.customer.name,
        propertyId: visit.property?.id,
        visitId,
        address: visit.address ?? visit.property?.address,
        city: visit.city ?? visit.property?.city,
        state: visit.state ?? visit.property?.state,
        zip: visit.zip ?? visit.property?.zip,
      });
      return;
    }
    const res = await fetch("/api/estimates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: visit.customer.id,
        propertyId: visit.property?.id,
        visitId,
      }),
    });
    if (!res.ok) {
      toast.error("Failed to create estimate");
      return;
    }
    const estimate = await res.json();
    window.location.href = `/estimates/${estimate.id}`;
  }

  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Customers", "Estimates"]}
        title="Estimates"
        actions={
          visitId ? (
            <Button
              size="sm"
              onClick={createFromVisit}
              disabled={holidayLightingFeaturesLoading}
            >
              <Plus className="h-4 w-4" />
              Create from visit
            </Button>
          ) : (
            <Button size="sm" asChild>
              <Link
                href={
                  holidayLightingEnabled ? holidayEstimateWizardUrl() : "/estimates/new"
                }
              >
                <Plus className="h-4 w-4" />
                New estimate
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-4">
        <Input
          placeholder="Search estimates"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : estimates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No estimates found.</p>
      ) : (
        <div className="rounded-lg border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {estimates.map((estimate) => (
                <TableRow key={estimate.id}>
                  <TableCell>
                    <Link
                      href={`/estimates/${estimate.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {estimate.displayNumber ?? estimate.estimateNumber ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <CustomerNameWithBadge
                      name={estimate.customer.name}
                      doNotService={estimate.customer.doNotService}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{estimate.status}</Badge>
                  </TableCell>
                  <TableCell>{formatCurrency(estimate.total)}</TableCell>
                  <TableCell>{format(new Date(estimate.createdAt), "MMM d, yyyy")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </ContentArea>
  );
}
