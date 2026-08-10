"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Mail, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { HolidayLightingPlanSection } from "@/components/holiday-lighting/HolidayLightingPlanSection";
import { blobProxyUrl } from "@/lib/blob/urls";
import { formatEstimateLineQtyPrice } from "@/lib/estimates/format-line";
import { formatPhoneDisplay } from "@/lib/inbox/phone";

type EstimatePreview = {
  id: string;
  estimateNumber: string | null;
  portalPath: string | null;
  status: string;
  total: number;
  subtotal: number;
  discountTotal: number;
  customer: {
    name: string;
    email: string | null;
    phone: string | null;
  };
  property: { name: string; address: string | null } | null;
  options: Array<{
    id: string;
    label: string;
    displayNumber: string;
    total: number;
  }>;
  lineItems: Array<{
    id: string;
    optionId: string | null;
    name: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
    unit?: string;
    total: number;
  }>;
  attachments: Array<{
    id: string;
    blobUrl: string;
    fileName: string;
    mimeType: string;
  }>;
  designExportMetadata?: Record<string, unknown> | null;
};

type Channel = "email" | "sms";

type Props = {
  open: boolean;
  estimateId: string | null;
  onClose: () => void;
  onSent?: () => void;
};

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function lightingPreviewUrl(estimate: EstimatePreview | null): string | null {
  if (!estimate) return null;
  const meta = estimate.designExportMetadata;
  const fromMeta =
    typeof meta?.previewImageUrl === "string"
      ? meta.previewImageUrl
      : typeof meta?.sourcePhotoUrl === "string"
        ? meta.sourcePhotoUrl
        : null;
  const attachment = estimate.attachments.find(
    (a) => a.mimeType.startsWith("image/") || /preview|lighting/i.test(a.fileName)
  );
  const raw = fromMeta ?? attachment?.blobUrl ?? null;
  if (!raw) return null;
  return blobProxyUrl(raw) ?? raw;
}

export function EstimateSendDialog({ open, estimateId, onClose, onSent }: Props) {
  const [estimate, setEstimate] = useState<EstimatePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [channel, setChannel] = useState<Channel>("email");
  const [activeOptionId, setActiveOptionId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !estimateId) {
      setEstimate(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/estimates/${estimateId}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to load estimate");
        if (cancelled) return;
        setEstimate(data as EstimatePreview);
        setActiveOptionId(data.options?.[0]?.id ?? null);
        const hasEmail = Boolean(data.customer?.email);
        const hasPhone = Boolean(data.customer?.phone);
        setChannel(hasEmail ? "email" : hasPhone ? "sms" : "email");
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load estimate");
          onClose();
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, estimateId, onClose]);

  const activeOption = useMemo(() => {
    if (!estimate) return null;
    return estimate.options.find((o) => o.id === activeOptionId) ?? estimate.options[0] ?? null;
  }, [estimate, activeOptionId]);

  const lines = useMemo(() => {
    if (!estimate) return [];
    if (!activeOption) return estimate.lineItems;
    return estimate.lineItems.filter(
      (item) => !item.optionId || item.optionId === activeOption.id
    );
  }, [estimate, activeOption]);

  const previewImage = lightingPreviewUrl(estimate);

  async function send() {
    if (!estimateId || !estimate) return;
    if (channel === "email" && !estimate.customer.email) {
      toast.error("Customer has no email address");
      return;
    }
    if (channel === "sms" && !estimate.customer.phone) {
      toast.error("Customer has no phone number");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/estimates/${estimateId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to send estimate");
        return;
      }
      toast.success(channel === "email" ? "Estimate emailed" : "Estimate texted");
      onSent?.();
      onClose();
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="estimate-send-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 id="estimate-send-title" className="text-base font-semibold">
              Preview &amp; send estimate
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Review what the customer will see, then send by email or text.
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={sending}>
            Close
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading || !estimate ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading estimate preview…
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-[#faf9f7] p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 pb-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Estimate</p>
                    <p className="text-lg font-semibold">
                      {activeOption?.displayNumber ?? estimate.estimateNumber ?? "Draft"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">For {estimate.customer.name}</p>
                    {estimate.property?.address || estimate.property?.name ? (
                      <p className="text-sm text-muted-foreground">
                        {estimate.property.address || estimate.property.name}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
                    <p className="text-xl font-semibold">
                      {money(activeOption?.total ?? estimate.total)}
                    </p>
                  </div>
                </div>

                {estimate.options.length > 1 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {estimate.options.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className={
                          opt.id === activeOption?.id
                            ? "rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                            : "rounded-md border border-border bg-white px-3 py-1.5 text-xs font-medium"
                        }
                        onClick={() => setActiveOptionId(opt.id)}
                      >
                        {opt.label} · {money(opt.total)}
                      </button>
                    ))}
                  </div>
                ) : null}

                {previewImage &&
                estimate.designExportMetadata?.source !== "holiday-lighting-quote" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewImage}
                    alt="Lighting preview"
                    className="mt-4 max-h-64 w-full rounded-md border border-border object-cover"
                  />
                ) : null}

                {estimate.designExportMetadata?.source === "holiday-lighting-quote" ? (
                  <div className="mt-4">
                    <HolidayLightingPlanSection
                      designExportMetadata={estimate.designExportMetadata}
                      mode="customer"
                      priceField={
                        activeOption?.label?.toLowerCase().includes("lease")
                          ? "leaseTotal"
                          : "purchaseTotal"
                      }
                      title="Strand layout"
                      description="Color-coded strands with label and cost."
                    />
                  </div>
                ) : null}

                <ul className="mt-4 divide-y divide-border/70 text-sm">
                  {lines.map((line) => (
                    <li key={line.id} className="flex items-start justify-between gap-3 py-2">
                      <div>
                        <p className="font-medium">{line.name}</p>
                        {line.description ? (
                          <p className="text-xs text-muted-foreground">{line.description}</p>
                        ) : null}
                        <p className="text-xs text-muted-foreground">
                          {formatEstimateLineQtyPrice(line)}
                        </p>
                      </div>
                      <p className="shrink-0 font-medium">{money(line.total)}</p>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 space-y-1 border-t border-border/70 pt-3 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>{money(estimate.subtotal)}</span>
                  </div>
                  {estimate.discountTotal > 0 ? (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Discounts</span>
                      <span>-{money(estimate.discountTotal)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between text-base font-semibold">
                    <span>Total</span>
                    <span>{money(activeOption?.total ?? estimate.total)}</span>
                  </div>
                </div>
              </div>

              {estimate.portalPath ? (
                <p className="text-xs text-muted-foreground">
                  Customer link opens a branded approval page (not a PDF attachment).{" "}
                  <Link
                    href={estimate.portalPath}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Open full customer view
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-border px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Send via
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                variant={channel === "email" ? "default" : "outline"}
                size="sm"
                disabled={!estimate?.customer.email || sending}
                onClick={() => setChannel("email")}
              >
                <Mail className="h-4 w-4" />
                Email
                {estimate?.customer.email ? (
                  <span className="ml-1 font-normal opacity-80">{estimate.customer.email}</span>
                ) : (
                  <span className="ml-1 font-normal opacity-70">No email on file</span>
                )}
              </Button>
              <Button
                type="button"
                variant={channel === "sms" ? "default" : "outline"}
                size="sm"
                disabled={!estimate?.customer.phone || sending}
                onClick={() => setChannel("sms")}
              >
                <MessageSquare className="h-4 w-4" />
                Text
                {estimate?.customer.phone ? (
                  <span className="ml-1 font-normal opacity-80">
                    {formatPhoneDisplay(estimate.customer.phone)}
                  </span>
                ) : (
                  <span className="ml-1 font-normal opacity-70">No phone on file</span>
                )}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={sending} onClick={onClose}>
              Not now
            </Button>
            {estimateId ? (
              <Button type="button" variant="outline" asChild>
                <Link href={`/estimates/${estimateId}`}>Open estimate</Link>
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={
                sending ||
                loading ||
                !estimate ||
                (channel === "email" ? !estimate.customer.email : !estimate.customer.phone)
              }
              onClick={() => void send()}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {channel === "email" ? "Send email" : "Send text"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
