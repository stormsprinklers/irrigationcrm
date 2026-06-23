"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, CheckCircle2, MapPin, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CollectPaymentButton } from "@/components/payments/CollectPaymentButton";
import { CustomerContactBar } from "@/components/visits/CustomerContactBar";
import { LineItemsSection } from "@/components/visits/LineItemsSection";
import { VisitProfitSection } from "@/components/visits/VisitProfitSection";
import { TimeTrackingBar } from "@/components/visits/TimeTrackingBar";
import { VisitAttachmentsSection } from "@/components/visits/VisitAttachmentsSection";
import { VisitChecklistsSection } from "@/components/visits/VisitChecklistsSection";
import { VisitDiscountsSection } from "@/components/visits/VisitDiscountsSection";
import { VisitEstimatesSection } from "@/components/visits/VisitEstimatesSection";
import { VisitMaintenancePlanSection } from "@/components/visits/VisitMaintenancePlanSection";
import { VisitNotesSection } from "@/components/visits/VisitNotesSection";
import { VisitTagsSection } from "@/components/visits/VisitTagsSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { computeTotals, sumDiscounts, sumLineItems } from "@/lib/visits/totals";
import { formatPostalAddress, googleMapsDirectionsUrl } from "@/lib/maps";
import { requestCurrentPosition } from "@/lib/maps/geolocation";
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
  } | null;
  serviceArea: { id: string; name: string; color: string };
  assignedUser: { id: string; name: string; color: string | null; photoUrl: string | null } | null;
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
    payments: Array<{ amount: string | number; refundedAt: string | null }>;
  }>;
};

type TimeEvent = {
  id: string;
  type: "EN_ROUTE" | "START" | "PAUSE" | "RESUME" | "FINISH";
  occurredAt: string;
  user: { id: string; name: string };
};

type Note = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; photoUrl: string | null; color: string | null };
};

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
  const invoice = visit.invoices?.[0];
  if (!invoice) {
    return { isPaid: false, amountPaid: 0, balanceDue: null as number | null, invoice: null };
  }

  const invoiceTotal = toAmount(invoice.total);
  const amountPaid = invoice.payments.reduce((sum, payment) => {
    if (payment.refundedAt) return sum;
    return sum + toAmount(payment.amount);
  }, 0);
  const balanceDue = Math.max(0, invoiceTotal - amountPaid);
  const isPaid = balanceDue <= 0 || invoice.status === "PAID";

  return { isPaid, amountPaid, balanceDue, invoice };
}

export function VisitDetail({ visitId }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const canDelete = session?.user?.role !== "TECH";
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
  const paymentSummary = getVisitPaymentSummary(visit);
  const jobAddress =
    formatPostalAddress(visit) ||
    (visit.property ? formatPostalAddress(visit.property) : null) ||
    (visit.customer ? formatPostalAddress(visit.customer) : null);
  const mapsUrl = jobAddress ? googleMapsDirectionsUrl(jobAddress) : null;
  const location = jobAddress || visit.serviceArea.name;

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
            {format(new Date(visit.startAt), "EEE, MMM d")} ·{" "}
            {format(new Date(visit.startAt), "h:mm a")} – {format(new Date(visit.endAt), "h:mm a")}
          </p>
          <div className="mt-2 flex items-start gap-2">
            <p className="text-sm text-muted-foreground">{location}</p>
            {mapsUrl ? (
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                asChild
                title="Navigate with Google Maps"
              >
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                  <MapPin className="h-4 w-4" />
                  <span className="sr-only">Open in Google Maps</span>
                </a>
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CollectPaymentButton
            visitId={visit.id}
            total={paymentSummary.balanceDue ?? total}
            disabled={paymentSummary.isPaid || total <= 0}
            paid={paymentSummary.isPaid}
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

      <CustomerContactBar customer={visit.customer} />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <LineItemsSection visitId={visit.id} lineItems={visit.lineItems} onUpdated={load} />
          <VisitChecklistsSection visitId={visit.id} onUpdated={load} />
          <VisitNotesSection visitId={visit.id} notes={notes} onUpdated={load} />
          <VisitAttachmentsSection
            visitId={visit.id}
            attachments={attachments}
            onUpdated={load}
          />
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Visit total</p>
            <p className="text-2xl font-semibold">{formatCurrency(total)}</p>
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
            {discountTotal > 0 ? (
              <p className="text-xs text-muted-foreground">
                Subtotal {formatCurrency(subtotal)} · Discounts −{formatCurrency(discountTotal)}
              </p>
            ) : null}
          </div>

          <VisitProfitSection visitId={visit.id} />

          <VisitTagsSection visitId={visit.id} tags={visit.tags} onUpdated={load} />
          {canDelete ? (
            <div className="rounded-lg border p-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(visit.isCallback)}
                  onChange={(e) => toggleCallback(e.target.checked)}
                />
                Callback job (excludes callback-specific checklists)
              </label>
            </div>
          ) : null}
          <VisitMaintenancePlanSection
            visitId={visit.id}
            customerId={visit.customer?.id ?? null}
            propertyId={visit.property?.id ?? null}
            onUpdated={load}
          />
          <VisitDiscountsSection
            visitId={visit.id}
            discounts={visit.discounts}
            onUpdated={load}
          />
          <VisitEstimatesSection visitId={visit.id} estimates={visit.estimates} />
        </div>
      </div>

      {deleteOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => setDeleteOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
            <h2 className="text-lg font-semibold">Delete visit?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This will permanently delete &ldquo;{visit.title}&rdquo; and its line items, notes, and
              attachments. This cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={deleteVisit} disabled={deleting}>
                {deleting ? "Deleting..." : "Delete visit"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
