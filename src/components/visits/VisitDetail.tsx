"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { isFieldRole, canViewProfitMargins } from "@/lib/employees";
import { ArrowLeft, CheckCircle2, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { CollectPaymentButton } from "@/components/payments/CollectPaymentButton";
import { CustomerVisitPanel } from "@/components/visits/CustomerVisitPanel";
import { LineItemsSection } from "@/components/visits/LineItemsSection";
import { VisitProfitSection } from "@/components/visits/VisitProfitSection";
import { TimeTrackingBar } from "@/components/visits/TimeTrackingBar";
import { VisitAttachmentsSection } from "@/components/visits/VisitAttachmentsSection";
import { VisitChecklistsSection } from "@/components/visits/VisitChecklistsSection";
import { VisitEstimatesSection } from "@/components/visits/VisitEstimatesSection";
import { VisitMaintenancePlanSection } from "@/components/visits/VisitMaintenancePlanSection";
import { VisitScheduleSection } from "@/components/visits/VisitScheduleSection";
import { VisitNotesSection, type VisitNoteItem } from "@/components/visits/VisitNotesSection";
const PartsRunDialog = dynamic(() => import("@/components/visits/PartsRunDialog").then((mod) => mod.PartsRunDialog));
const VisitIrrigationSection = dynamic(() => import("@/components/visits/VisitIrrigationSection").then((mod) => mod.VisitIrrigationSection));
const VisitInstallPlanSection = dynamic(() => import("@/components/visits/VisitInstallPlanSection").then((mod) => mod.VisitInstallPlanSection));
const HolidayLightingPlanSection = dynamic(() => import("@/components/holiday-lighting/HolidayLightingPlanSection").then((mod) => mod.HolidayLightingPlanSection));
import { VisitTagsSection } from "@/components/visits/VisitTagsSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { computeTotals, sumDiscounts, sumLineItems } from "@/lib/visits/totals";
import { formatPostalAddress, googleMapsDirectionsUrl } from "@/lib/maps";
import { requestCurrentPosition } from "@/lib/maps/geolocation";
import { useMaintenancePlansFeatures, useIrrigationFeatures } from "@/components/layout/CompanyBrandProvider";
import type { VisitEtaDisplay } from "@/components/visits/TimeTrackingBar";

type VisitDetailData = {
  id: string;
  title: string;
  status: string;
  startAt: string;
  endAt: string;
  division: string;
  tags: string[];
  isCallback?: boolean;
  enRouteEtaSeconds?: number | null;
  enRouteEtaAt?: string | null;
  enRouteCalculatedAt?: string | null;
  eta?: VisitEtaDisplay | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    doNotService?: boolean;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  } | null;
  property: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    aerialImageUrl?: string | null;
    propertyDiagramUrl?: string | null;
    irrigationMapStatus?: string | null;
  } | null;
  designExportMetadata?: Record<string, unknown> | null;
  installDurationDays?: number | null;
  designProjectId?: string | null;
  serviceArea: { id: string; name: string; color: string } | null;
  assignedUser: { id: string; name: string; color: string | null; photoUrl: string | null } | null;
  assignedUsers: Array<{
    id: string;
    name: string;
    color: string | null;
    photoUrl: string | null;
  }>;
  lineItems: Array<{
    id: string;
    name: string;
    description: string | null;
    quantity: string | number;
    unitPrice: string | number;
    total: string | number;
  }>;
  discounts: Array<{
    id: string;
    label: string | null;
    type: "PERCENT" | "FIXED";
    amount: string | number;
  }>;
  estimates: Array<{
    id: string;
    status: string;
    total: string | number;
    createdAt: string;
  }>;
  invoices?: Array<{
    id: string;
    invoiceNumber: string;
    status: string;
    total: string | number;
    paidAt: string | null;
    publicToken: string;
    createdAt: string;
    payments: Array<{
      amount: string | number;
      paidAt: string;
      refundedAt: string | null;
    }>;
  }>;
};

type TimeEvent = {
  id: string;
  type: "EN_ROUTE" | "START" | "PAUSE" | "RESUME" | "FINISH";
  occurredAt: string;
  user: { id: string; name: string };
};

type Note = VisitNoteItem;

type Attachment = {
  id: string;
  blobUrl: string;
  fileName: string;
  mimeType: string;
  createdAt: string;
  uploadedBy: { id: string; name: string };
};

type Props = {
  visitId: string;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function toAmount(value: string | number) {
  return typeof value === "number" ? value : Number(value);
}

function getVisitPaymentSummary(visit: VisitDetailData) {
  const invoices = (visit.invoices ?? []).filter((invoice) => invoice.status !== "VOID");
  const invoicePaidAmount = (invoice: (typeof invoices)[number]) => {
    const recorded = invoice.payments.reduce((sum, payment) => {
      if (payment.refundedAt) return sum;
      return sum + toAmount(payment.amount);
    }, 0);
    return recorded > 0 || invoice.status !== "PAID" ? recorded : toAmount(invoice.total);
  };
  const amountPaid = invoices.reduce((sum, invoice) => sum + invoicePaidAmount(invoice), 0);
  const depositInvoices = invoices.filter((invoice) => invoice.invoiceNumber.includes("-DEP-"));
  const depositPaid = depositInvoices.reduce(
    (sum, invoice) => sum + invoicePaidAmount(invoice),
    0
  );
  const latestDepositPaymentAt = depositInvoices
    .flatMap((invoice) => [
      ...invoice.payments.filter((payment) => !payment.refundedAt).map((payment) => payment.paidAt),
      ...(invoice.paidAt ? [invoice.paidAt] : []),
    ])
    .sort()
    .at(-1) ?? null;
  const invoice =
    invoices.find(
      (candidate) =>
        !candidate.invoiceNumber.includes("-DEP-") &&
        !candidate.invoiceNumber.includes("-PAY-") &&
        ["DRAFT", "SENT", "PARTIAL"].includes(candidate.status)
    ) ??
    invoices.find(
      (candidate) =>
        !candidate.invoiceNumber.includes("-DEP-") &&
        !candidate.invoiceNumber.includes("-PAY-")
    ) ??
    invoices[0] ??
    null;

  return {
    isPaid: false,
    amountPaid,
    depositPaid,
    latestDepositPaymentAt,
    balanceDue: null as number | null,
    invoice,
  };
}

export function VisitDetail({ visitId }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const { enabled: irrigationEnabled } = useIrrigationFeatures();
  const { enabled: maintenanceEnabled } = useMaintenancePlansFeatures();
  const canDelete = !isFieldRole(session?.user?.role ?? "");
  const canEditSchedule = !isFieldRole(session?.user?.role ?? "");
  const showProfit = canViewProfitMargins(session?.user?.role ?? "");
  const paymentStatus = searchParams.get("payment");
  const sessionId = searchParams.get("session_id");
  const [visit, setVisit] = useState<VisitDetailData | null>(null);
  const [timeEvents, setTimeEvents] = useState<TimeEvent[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeLoading, setTimeLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [partsRunOpen, setPartsRunOpen] = useState(false);

  const load = useCallback(async () => {
    const [visitRes, timeRes, notesRes, attachmentsRes] = await Promise.all([
      fetch(`/api/visits/${visitId}`),
      fetch(`/api/visits/${visitId}/time`),
      fetch(`/api/visits/${visitId}/notes`),
      fetch(`/api/visits/${visitId}/attachments`),
    ]);

    if (visitRes.ok) setVisit(await visitRes.json());
    if (timeRes.ok) setTimeEvents(await timeRes.json());
    if (notesRes.ok) setNotes(await notesRes.json());
    if (attachmentsRes.ok) setAttachments(await attachmentsRes.json());
  }, [visitId]);

  useEffect(() => {
    load()
      .catch(() => toast.error("Failed to load visit"))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (visit?.status !== "EN_ROUTE") return;
    const departed = [...timeEvents].reverse().find(event => event.type === "EN_ROUTE");
    if (!departed) return;
    const refresh = async () => {
      const [visitRes, timeRes] = await Promise.all([fetch(`/api/visits/${visitId}`), fetch(`/api/visits/${visitId}/time`)]);
      if (visitRes.ok) setVisit(await visitRes.json());
      if (timeRes.ok) setTimeEvents(await timeRes.json());
    };
    const remaining = Math.max(0, new Date(departed.occurredAt).getTime() + 7200000 - Date.now());
    const timeout = window.setTimeout(() => void refresh().catch(() => {}), remaining + 100);
    const onFocus = () => { if (Date.now() >= new Date(departed.occurredAt).getTime() + 7200000) void refresh().catch(() => {}); };
    window.addEventListener("focus", onFocus);
    return () => {window.clearTimeout(timeout); window.removeEventListener("focus", onFocus);};
  }, [visit?.status, timeEvents, visitId]);

  useEffect(() => {
    if (paymentStatus !== "success" || !sessionId) return;

    async function confirmPayment() {
      try {
        const res = await fetch("/api/payments/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const data = await res.json();
        if (data.confirmed || data.alreadyRecorded) {
          await load();
          toast.success("Payment recorded");
        } else if (res.status !== 202) {
          toast.error(data.error ?? "Unable to confirm payment");
        }
      } catch {
        toast.error("Unable to confirm payment");
      }
    }

    void confirmPayment();
  }, [paymentStatus, sessionId, load]);

  async function handleTimeEvent(type: TimeEvent["type"]) {
    setTimeLoading(true);
    try {
      const payload: Record<string, unknown> = { type };

      if (type === "EN_ROUTE") {
        const position = await requestCurrentPosition();
        if (position.ok) {
          payload.originLat = position.lat;
          payload.originLng = position.lng;
        }
      }

      const res = await fetch(`/api/visits/${visitId}/time`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to update time tracking");
        return;
      }
      if (data.etaWarning) {
        toast.message(data.etaWarning);
      } else if (type === "EN_ROUTE" && data.eta) {
        toast.success(`ETA updated — arriving in ~${data.eta.minutes} min`);
      }
      setVisit(data);
      const timeRes = await fetch(`/api/visits/${visitId}/time`);
      if (timeRes.ok) setTimeEvents(await timeRes.json());
    } finally {
      setTimeLoading(false);
    }
  }

  function visitEta(visitData: VisitDetailData): VisitEtaDisplay | null {
    if (visitData.eta) return visitData.eta;
    if (!visitData.enRouteEtaSeconds || !visitData.enRouteEtaAt) return null;
    return {
      minutes: Math.max(1, Math.round(visitData.enRouteEtaSeconds / 60)),
      arrivalAt: visitData.enRouteEtaAt,
      calculatedAt: visitData.enRouteCalculatedAt ?? null,
    };
  }

  async function toggleCallback(isCallback: boolean) {
    const res = await fetch(`/api/visits/${visitId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCallback }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to update callback flag");
      return;
    }
    await load();
  }

  async function deleteVisit() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/visits/${visitId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to delete visit");
        return;
      }
      toast.success("Visit deleted");
      router.push("/schedule");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading visit...</p>;
  }

  if (!visit) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Visit not found.</p>
        <Button variant="outline" asChild>
          <Link href="/schedule">
            <ArrowLeft className="h-4 w-4" />
            Back to schedule
          </Link>
        </Button>
      </div>
    );
  }

  const subtotal = sumLineItems(visit.lineItems);
  const discountTotal = sumDiscounts(subtotal, visit.discounts);
  const { total } = computeTotals(subtotal, discountTotal);
  const basePaymentSummary = getVisitPaymentSummary(visit);
  const paymentSummary = {
    ...basePaymentSummary,
    balanceDue: Math.max(0, total - basePaymentSummary.amountPaid),
    isPaid:
      total > 0 &&
      basePaymentSummary.amountPaid > 0 &&
      total - basePaymentSummary.amountPaid <= 0.005,
  };
  const jobAddress =
    formatPostalAddress(visit) ||
    (visit.property ? formatPostalAddress(visit.property) : null) ||
    (visit.customer ? formatPostalAddress(visit.customer) : null);
  const mapsUrl = jobAddress ? googleMapsDirectionsUrl(jobAddress) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
            <Link href="/schedule">
              <ArrowLeft className="h-4 w-4" />
              Schedule
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{visit.title}</h1>
            <Badge variant="outline">{visit.status.replace("_", " ")}</Badge>
            {paymentSummary.isPaid ? (
              <Badge className="bg-green-600 hover:bg-green-600">Paid</Badge>
            ) : null}
            {visit.isCallback ? <Badge variant="destructive">Callback</Badge> : null}
            <Badge variant="secondary">{visit.division}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {format(new Date(visit.startAt), "EEE, MMM d, yyyy")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CollectPaymentButton
            visitId={visit.id}
            total={paymentSummary.balanceDue ?? total}
            disabled={paymentSummary.isPaid || total <= 0}
            paid={paymentSummary.isPaid}
            allowInvoice
            onInvoiceSent={load}
          />
          {canDelete ? (
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      <TimeTrackingBar
        status={visit.status}
        timeEvents={timeEvents}
        onEvent={handleTimeEvent}
        loading={timeLoading}
        eta={visitEta(visit)}
      />

      {irrigationEnabled && visit.customer?.id ? (
        <VisitIrrigationSection customerId={visit.customer.id} property={visit.property} />
      ) : null}

      {irrigationEnabled ? (
        <div className="flex w-full sm:justify-end">
          <Button
            type="button"
            className="h-12 w-full gap-2 text-base sm:h-9 sm:w-auto sm:text-sm"
            onClick={() => setPartsRunOpen(true)}
          >
            <Wrench className="h-5 w-5 sm:h-4 sm:w-4" />
            Parts Run
          </Button>
        </div>
      ) : null}

      {irrigationEnabled && partsRunOpen ? (
        <PartsRunDialog
          visitId={visit.id}
          open={partsRunOpen}
          onOpenChange={setPartsRunOpen}
          onPaused={async () => {
            const timeRes = await fetch(`/api/visits/${visitId}/time`);
            if (timeRes.ok) setTimeEvents(await timeRes.json());
            const visitRes = await fetch(`/api/visits/${visitId}`);
            if (visitRes.ok) setVisit(await visitRes.json());
          }}
        />
      ) : null}

      {irrigationEnabled && visit.designExportMetadata ? (
        <VisitInstallPlanSection
          designExportMetadata={visit.designExportMetadata}
          estimatedManHours={
            typeof (visit.designExportMetadata as Record<string, unknown>)?.estimatedManHours ===
            "number"
              ? ((visit.designExportMetadata as Record<string, unknown>).estimatedManHours as number)
              : null
          }
          installDurationDays={visit.installDurationDays ?? 4}
          visitId={visit.id}
          onDurationUpdated={load}
        />
      ) : null}

      {visit.designExportMetadata &&
      (visit.designExportMetadata as Record<string, unknown>).source ===
        "holiday-lighting-quote" ? (
        <HolidayLightingPlanSection
          designExportMetadata={visit.designExportMetadata as Record<string, unknown>}
          mode="installer"
        />
      ) : null}

      <CustomerVisitPanel
        customer={visit.customer}
        visitId={visit.id}
        jobAddress={jobAddress}
        mapsUrl={mapsUrl}
        onCustomerLinked={load}
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <LineItemsSection
            visitId={visit.id}
            lineItems={visit.lineItems}
            discounts={visit.discounts}
            onUpdated={load}
          />
          <VisitChecklistsSection visitId={visit.id} onUpdated={load} />
          <VisitNotesSection
            visitId={visit.id}
            customerId={visit.customer?.id}
            notes={notes}
            onUpdated={load}
          />
          <VisitAttachmentsSection
            visitId={visit.id}
            attachments={attachments}
            onUpdated={load}
          />
        </div>

        <div className="space-y-6">
          <VisitScheduleSection
            visitId={visit.id}
            title={visit.title}
            startAt={visit.startAt}
            endAt={visit.endAt}
            status={visit.status}
            assignedUser={
              visit.assignedUser
                ? {
                    id: visit.assignedUser.id,
                    name: visit.assignedUser.name,
                    photoUrl: visit.assignedUser.photoUrl,
                    color: visit.assignedUser.color,
                  }
                : null
            }
            assignedUsers={visit.assignedUsers ?? (visit.assignedUser ? [visit.assignedUser] : [])}
            canEdit={canEditSchedule}
            onUpdated={load}
          />
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Visit total</p>
            <p className="text-2xl font-semibold">{formatCurrency(total)}</p>
            {paymentSummary.depositPaid > 0 ? (
              <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                <p className="font-medium">
                  Deposit paid: {formatCurrency(paymentSummary.depositPaid)}
                </p>
                {paymentSummary.latestDepositPaymentAt ? (
                  <p className="text-xs text-blue-700">
                    {format(
                      new Date(paymentSummary.latestDepositPaymentAt),
                      "MMM d, yyyy h:mm a"
                    )}
                  </p>
                ) : null}
              </div>
            ) : null}
            {paymentSummary.isPaid ? (
              <div className="mt-3 flex items-start gap-2 rounded-md bg-green-50 p-3 text-sm text-green-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">
                    Invoice {paymentSummary.invoice?.invoiceNumber} paid
                  </p>
                  {paymentSummary.invoice?.paidAt ? (
                    <p className="text-xs text-green-700">
                      {format(new Date(paymentSummary.invoice.paidAt), "MMM d, yyyy h:mm a")}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : paymentSummary.invoice ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Invoice {paymentSummary.invoice.invoiceNumber}:{" "}
                {formatCurrency(paymentSummary.balanceDue ?? total)} due
              </p>
            ) : null}
            {paymentSummary.amountPaid > 0 && !paymentSummary.isPaid ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Total paid {formatCurrency(paymentSummary.amountPaid)} · Remaining balance{" "}
                {formatCurrency(paymentSummary.balanceDue ?? total)}
              </p>
            ) : null}
            {discountTotal > 0 ? (
              <p className="text-xs text-muted-foreground">
                Subtotal {formatCurrency(subtotal)} · Discounts −{formatCurrency(discountTotal)}
              </p>
            ) : null}
          </div>

          {showProfit ? <VisitProfitSection visitId={visit.id} /> : null}

          <VisitTagsSection visitId={visit.id} tags={visit.tags} onUpdated={load} />
          {canDelete ? (
            <div className="rounded-lg border p-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(visit.isCallback)}
                  onChange={(e) => toggleCallback(e.target.checked)}
                />
                Callback visit (excludes callback-specific checklists)
              </label>
            </div>
          ) : null}
          {maintenanceEnabled ? <VisitMaintenancePlanSection
            visitId={visit.id}
            customerId={visit.customer?.id ?? null}
            propertyId={visit.property?.id ?? null}
            onUpdated={load}
          />
          : null}
          <VisitEstimatesSection visitId={visit.id} estimates={visit.estimates} customerId={visit.customer?.id} propertyId={visit.property?.id} />
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete visit?"
        description={`This will permanently delete “${visit.title}” and its line items, notes, and attachments. This cannot be undone.`}
        confirmLabel="Delete visit"
        confirmVariant="destructive"
        busy={deleting}
        onConfirm={deleteVisit}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
