"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import { toast } from "sonner";
import { CollectPaymentButton } from "@/components/payments/CollectPaymentButton";
import { CustomerContactBar } from "@/components/visits/CustomerContactBar";
import { LineItemsSection } from "@/components/visits/LineItemsSection";
import { TimeTrackingBar } from "@/components/visits/TimeTrackingBar";
import { VisitAttachmentsSection } from "@/components/visits/VisitAttachmentsSection";
import { VisitDiscountsSection } from "@/components/visits/VisitDiscountsSection";
import { VisitEstimatesSection } from "@/components/visits/VisitEstimatesSection";
import { VisitNotesSection } from "@/components/visits/VisitNotesSection";
import { VisitTagsSection } from "@/components/visits/VisitTagsSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { computeTotals, sumDiscounts, sumLineItems } from "@/lib/visits/totals";

type VisitDetailData = {
  id: string;
  title: string;
  status: string;
  startAt: string;
  endAt: string;
  division: string;
  tags: string[];
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  customer: { id: string; name: string; phone: string | null; email: string | null } | null;
  property: { id: string; name: string; address: string | null } | null;
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

export function VisitDetail({ visitId }: Props) {
  const [visit, setVisit] = useState<VisitDetailData | null>(null);
  const [timeEvents, setTimeEvents] = useState<TimeEvent[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeLoading, setTimeLoading] = useState(false);

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

  async function handleTimeEvent(type: TimeEvent["type"]) {
    setTimeLoading(true);
    try {
      const res = await fetch(`/api/visits/${visitId}/time`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) {
        toast.error("Failed to update time tracking");
        return;
      }
      const updated = await res.json();
      setVisit(updated);
      const timeRes = await fetch(`/api/visits/${visitId}/time`);
      if (timeRes.ok) setTimeEvents(await timeRes.json());
    } finally {
      setTimeLoading(false);
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
  const location =
    [visit.address, visit.city, visit.state, visit.zip].filter(Boolean).join(", ") ||
    visit.property?.address ||
    visit.serviceArea.name;

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
            <Badge variant="secondary">{visit.division}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {format(new Date(visit.startAt), "EEE, MMM d")} ·{" "}
            {format(new Date(visit.startAt), "h:mm a")} – {format(new Date(visit.endAt), "h:mm a")}
          </p>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            {location}
          </p>
        </div>
        <CollectPaymentButton visitId={visit.id} total={total} disabled={visit.status === "COMPLETED"} />
      </div>

      <TimeTrackingBar
        status={visit.status}
        timeEvents={timeEvents}
        onEvent={handleTimeEvent}
        loading={timeLoading}
      />

      <CustomerContactBar customer={visit.customer} />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <LineItemsSection visitId={visit.id} lineItems={visit.lineItems} onUpdated={load} />
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
            {discountTotal > 0 ? (
              <p className="text-xs text-muted-foreground">
                Subtotal {formatCurrency(subtotal)} · Discounts −{formatCurrency(discountTotal)}
              </p>
            ) : null}
          </div>

          <VisitTagsSection visitId={visit.id} tags={visit.tags} onUpdated={load} />
          <VisitDiscountsSection
            visitId={visit.id}
            discounts={visit.discounts}
            onUpdated={load}
          />
          <VisitEstimatesSection visitId={visit.id} estimates={visit.estimates} />
        </div>
      </div>
    </div>
  );
}
