"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  FileText,
  Loader2,
  Plus,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { isFieldRole } from "@/lib/employees";
import { EstimateDesignSection } from "@/components/estimates/EstimateDesignSection";
import { EstimatePostApprovalDialog } from "@/components/estimates/EstimatePostApprovalDialog";
import { ItemPicker } from "@/components/price-book/ItemPicker";
import { CustomerNameWithBadge } from "@/components/customers/CustomerNameWithBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatEstimateLineQtyPrice } from "@/lib/estimates/format-line";
import { blobProxyUrl } from "@/lib/blob/urls";
import type { PriceBookItemDTO } from "@/lib/price-book/types";

type EstimateOptionData = {
  id: string;
  letter: string | null;
  label: string;
  sortOrder: number;
  subtotal: number;
  discountTotal: number;
  total: number;
  displayNumber: string;
};

type EstimateData = {
  id: string;
  estimateNumber: string | null;
  status: string;
  expiresAt: string | null;
  depositRequired: boolean;
  selectedOptionId: string | null;
  subtotal: number;
  discountTotal: number;
  total: number;
  signatureBlobUrl: string | null;
  signedAt: string | null;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    doNotService: boolean;
  };
  property: { id: string; name: string; address: string | null } | null;
  visit: { id: string; title: string; startAt: string } | null;
  options: EstimateOptionData[];
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
  discounts: Array<{
    id: string;
    optionId: string | null;
    label: string | null;
    type: "PERCENT" | "FIXED";
    amount: number;
  }>;
  notes: Array<{
    id: string;
    body: string;
    createdAt: string;
    author: { id: string; name: string } | null;
  }>;
  attachments: Array<{
    id: string;
    blobUrl: string;
    fileName: string;
    mimeType: string;
    createdAt: string;
  }>;
  designProjectId?: string | null;
  designVersionId?: string | null;
  designExportMetadata?: Record<string, unknown> | null;
  designInternalBom?: Array<Record<string, unknown>> | null;
  estimatedManHours?: number | null;
  installDurationDays?: number | null;
  needsScheduling?: boolean;
  premiumOptionTotal?: number | null;
};

type Props = { estimateId: string };

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function SignaturePad({ onSave, saving }: { onSave: (dataUrl: string) => Promise<void>; saving: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function getPoint(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    const point = getPoint(e);
    ctx?.beginPath();
    ctx?.moveTo(point.x, point.y);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    const point = getPoint(e);
    ctx?.lineTo(point.x, point.y);
    ctx?.stroke();
    hasInk.current = true;
  }

  function stopDraw() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!hasInk.current) {
      toast.error("Customer signature is required");
      return;
    }
    await onSave(canvas.toDataURL("image/png"));
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Have the customer sign with their finger or stylus, then save to approve.
      </p>
      <canvas
        ref={canvasRef}
        width={700}
        height={240}
        className="h-48 w-full touch-none rounded-md border border-border bg-white sm:h-56"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
      />
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          Clear
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve with signature"}
        </Button>
      </div>
    </div>
  );
}

export function EstimateDetail({ estimateId }: Props) {
  const router = useRouter();
  const { data: session } = useSession();
  const canDelete = !isFieldRole(session?.user?.role ?? "");
  const [estimate, setEstimate] = useState<EstimateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [discountLabel, setDiscountLabel] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountType, setDiscountType] = useState<"PERCENT" | "FIXED">("FIXED");
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [postApprovalOpen, setPostApprovalOpen] = useState(false);
  const [postApprovalMode, setPostApprovalMode] = useState<"choose" | "today" | "schedule">(
    "choose"
  );
  const [activeOptionId, setActiveOptionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/estimates/${estimateId}`);
    if (res.ok) {
      const data = (await res.json()) as EstimateData;
      setEstimate(data);
      setActiveOptionId((current) => {
        if (current && data.options.some((o) => o.id === current)) return current;
        return data.selectedOptionId ?? data.options[0]?.id ?? null;
      });
    }
  }, [estimateId]);

  useEffect(() => {
    load()
      .catch(() => toast.error("Failed to load estimate"))
      .finally(() => setLoading(false));
  }, [load]);

  // Poll while waiting for the customer to approve on the portal link.
  useEffect(() => {
    if (estimate?.status !== "SENT") return;
    const id = window.setInterval(() => {
      void load();
    }, 4000);
    return () => window.clearInterval(id);
  }, [estimate?.status, load]);

  function openPostApproval(mode: "choose" | "today" | "schedule") {
    setPostApprovalMode(mode);
    setPostApprovalOpen(true);
  }

  async function addLineItem(item: PriceBookItemDTO) {
    setSaving(true);
    try {
      const res = await fetch(`/api/estimates/${estimateId}/line-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceBookItemId: item.id,
          name: item.name,
          description: item.description,
          unitPrice: Number(item.unitPrice),
          quantity: 1,
          optionId: activeOptionId,
        }),
      });
      if (!res.ok) {
        toast.error("Failed to add line item");
        return;
      }
      const data = (await res.json()) as EstimateData;
      setEstimate(data);
    } finally {
      setSaving(false);
    }
  }

  async function removeLineItem(lineItemId: string) {
    const res = await fetch(
      `/api/estimates/${estimateId}/line-items?lineItemId=${encodeURIComponent(lineItemId)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      toast.error("Failed to remove line item");
      return;
    }
    setEstimate(await res.json());
  }

  async function addDiscount(e: React.FormEvent) {
    e.preventDefault();
    if (!discountAmount) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/estimates/${estimateId}/discounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: discountLabel || null,
          type: discountType,
          amount: Number(discountAmount),
          optionId: activeOptionId,
        }),
      });
      if (!res.ok) {
        toast.error("Failed to add discount");
        return;
      }
      setDiscountLabel("");
      setDiscountAmount("");
      setEstimate(await res.json());
    } finally {
      setSaving(false);
    }
  }

  async function removeDiscount(discountId: string) {
    const res = await fetch(
      `/api/estimates/${estimateId}/discounts?discountId=${encodeURIComponent(discountId)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      toast.error("Failed to remove discount");
      return;
    }
    setEstimate(await res.json());
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteBody.trim()) return;
    const res = await fetch(`/api/estimates/${estimateId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: noteBody }),
    });
    if (!res.ok) {
      toast.error("Failed to add note");
      return;
    }
    setNoteBody("");
    setEstimate(await res.json());
  }

  async function uploadAttachment(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/estimates/${estimateId}/attachments`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      toast.error("Failed to upload attachment");
      return;
    }
    await load();
  }

  async function sendEstimate() {
    setSaving(true);
    try {
      const res = await fetch(`/api/estimates/${estimateId}/send`, { method: "POST" });
      if (!res.ok) {
        toast.error("Failed to send estimate");
        return;
      }
      setEstimate(await res.json());
      toast.success("Estimate sent");
    } finally {
      setSaving(false);
    }
  }

  async function saveSignature(dataUrl: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/estimates/${estimateId}/signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature: dataUrl }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Failed to save signature");
        return;
      }
      setEstimate(await res.json());
      toast.success("Estimate approved with signature");
      setPostApprovalMode("choose");
      setPostApprovalOpen(true);
    } finally {
      setSaving(false);
    }
  }

  async function deleteEstimate() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/estimates/${estimateId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to delete estimate");
        return;
      }
      toast.success("Estimate deleted");
      router.push("/customers/estimates");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading estimate...</p>;

  if (!estimate) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Estimate not found.</p>
        <Button variant="outline" asChild>
          <Link href="/customers/estimates">
            <ArrowLeft className="h-4 w-4" />
            Back to estimates
          </Link>
        </Button>
      </div>
    );
  }

  const activeOption =
    estimate.options.find((o) => o.id === activeOptionId) ?? estimate.options[0] ?? null;
  const optionLineItems = estimate.lineItems.filter(
    (item) => !activeOption || item.optionId === activeOption.id || !item.optionId
  );
  const optionDiscounts = estimate.discounts.filter(
    (d) => !activeOption || d.optionId === activeOption.id || !d.optionId
  );
  const optionSubtotal = activeOption?.subtotal ?? estimate.subtotal;
  const optionDiscountTotal = activeOption?.discountTotal ?? estimate.discountTotal;
  const optionTotal = activeOption?.total ?? estimate.total;

  async function selectOption(optionId: string) {
    setActiveOptionId(optionId);
    const res = await fetch(`/api/estimates/${estimateId}/options`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId, select: true }),
    });
    if (res.ok) setEstimate(await res.json());
  }

  async function addOption(mode: "fresh" | "duplicate") {
    setSaving(true);
    try {
      const res = await fetch(`/api/estimates/${estimateId}/options`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          duplicateFromOptionId: mode === "duplicate" ? activeOptionId : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to add option");
        return;
      }
      const data = (await res.json()) as EstimateData;
      setEstimate(data);
      const newest = data.options[data.options.length - 1];
      if (newest) setActiveOptionId(newest.id);
      toast.success(mode === "duplicate" ? "Option duplicated" : "Blank option added");
    } finally {
      setSaving(false);
    }
  }

  async function removeOption(optionId: string) {
    if (!confirm("Delete this option and its line items?")) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/estimates/${estimateId}/options?optionId=${encodeURIComponent(optionId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to delete option");
        return;
      }
      const data = (await res.json()) as EstimateData;
      setEstimate(data);
      setActiveOptionId(data.selectedOptionId ?? data.options[0]?.id ?? null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-2" asChild>
            <Link href="/customers/estimates">
              <ArrowLeft className="h-4 w-4" />
              Estimates
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {activeOption?.displayNumber ?? estimate.estimateNumber ?? "Estimate"}
            </h1>
            <Badge variant="outline">{estimate.status}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <CustomerNameWithBadge
              name={estimate.customer.name}
              doNotService={estimate.customer.doNotService}
              nameClassName="text-sm font-medium"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {estimate.expiresAt
              ? `Expires ${format(new Date(estimate.expiresAt), "MMM d, yyyy")}`
              : "No expiry date"}
            {estimate.visit && (
              <>
                {" · "}
                <Link href={`/visits/${estimate.visit.id}`} className="text-primary hover:underline">
                  {estimate.visit.title}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={sendEstimate} disabled={saving}>
            <Send className="h-4 w-4" />
            Send
          </Button>
          {estimate.status === "APPROVED" ? (
            <>
              <Button
                variant="default"
                size="sm"
                onClick={() => openPostApproval("today")}
                disabled={saving}
              >
                Complete Today
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openPostApproval("schedule")}
                disabled={saving}
              >
                Schedule Visit
              </Button>
            </>
          ) : null}
          {canDelete ? (
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)} disabled={saving}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      {estimate.status === "APPROVED" || estimate.status === "CONVERTED" ? (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
          <CheckCircle2 className="h-7 w-7 shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold">
              {estimate.status === "CONVERTED" ? "Estimate converted" : "Estimate approved"}
            </p>
            <p className="text-sm text-emerald-800/80">
              {estimate.signedAt
                ? `Customer signed ${format(new Date(estimate.signedAt), "MMM d, yyyy h:mm a")}`
                : "Customer signature on file"}
            </p>
          </div>
        </div>
      ) : null}

      {estimate.status === "SENT" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Waiting for customer approval — this page updates automatically when they sign.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
              <CardTitle className="text-base">Options</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={saving || !activeOptionId}
                  onClick={() => addOption("duplicate")}
                >
                  <Copy className="h-4 w-4" />
                  Duplicate current
                </Button>
                <Button variant="outline" size="sm" disabled={saving} onClick={() => addOption("fresh")}>
                  <Plus className="h-4 w-4" />
                  New blank
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {estimate.options.map((option) => {
                  const selected = option.id === activeOption?.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => selectOption(option.id)}
                      className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                        selected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:bg-muted/60"
                      }`}
                    >
                      <div className="font-semibold">{option.displayNumber}</div>
                      <div className="text-xs text-muted-foreground">
                        {option.label} · {formatCurrency(option.total)}
                      </div>
                    </button>
                  );
                })}
              </div>
              {activeOption && estimate.options.length > 1 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={saving}
                  onClick={() => removeOption(activeOption.id)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete {activeOption.displayNumber}
                </Button>
              ) : null}
            </CardContent>
          </Card>

          {estimate.designProjectId ? (
            <EstimateDesignSection
              estimateId={estimate.id}
              designProjectId={estimate.designProjectId}
              designVersionId={estimate.designVersionId ?? null}
              designExportMetadata={estimate.designExportMetadata ?? null}
              designInternalBom={(estimate.designInternalBom as EstimateData["designInternalBom"]) ?? null}
              estimatedManHours={estimate.estimatedManHours ?? null}
              installDurationDays={estimate.installDurationDays ?? null}
              needsScheduling={estimate.needsScheduling ?? false}
              premiumOptionTotal={estimate.premiumOptionTotal ?? null}
              onUpdated={() => {
                fetch(`/api/estimates/${estimateId}`)
                  .then((r) => r.json())
                  .then((data) => setEstimate(data))
                  .catch(() => {});
              }}
            />
          ) : null}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">
                Line items
                {activeOption ? (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({activeOption.displayNumber})
                  </span>
                ) : null}
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)} disabled={saving}>
                Add item
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {optionLineItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No line items yet.</p>
              ) : (
                optionLineItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-muted-foreground">
                        {formatEstimateLineQtyPrice({
                          quantity: item.quantity,
                          unitPrice: item.unitPrice,
                          unit: item.unit,
                          currency: formatCurrency,
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{formatCurrency(item.total)}</span>
                      <Button variant="ghost" size="icon" onClick={() => removeLineItem(item.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
              <div className="border-t pt-3 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatCurrency(optionSubtotal)}</span>
                </div>
                {optionDiscountTotal > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Discounts</span>
                    <span>-{formatCurrency(optionDiscountTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(optionTotal)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Discounts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={addDiscount} className="grid gap-2 sm:grid-cols-[1fr_100px_120px_auto]">
                <Input value={discountLabel} onChange={(e) => setDiscountLabel(e.target.value)} placeholder="Label" />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  placeholder="Amount"
                  required
                />
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as "PERCENT" | "FIXED")}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="FIXED">Fixed ($)</option>
                  <option value="PERCENT">Percent (%)</option>
                </select>
                <Button type="submit" disabled={saving}>
                  Add
                </Button>
              </form>
              {optionDiscounts.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                  <span>
                    {d.label ?? "Discount"} — {d.type === "PERCENT" ? `${d.amount}%` : formatCurrency(d.amount)}
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => removeDiscount(d.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={addNote} className="flex gap-2">
                <Input value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Add a note..." />
                <Button type="submit">Add</Button>
              </form>
              {estimate.notes.map((note) => (
                <div key={note.id} className="rounded-md border p-3 text-sm">
                  <p>{note.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {note.author?.name ?? "Unknown"} · {format(new Date(note.createdAt), "MMM d, yyyy h:mm a")}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Attachments</CardTitle>
              <label className="cursor-pointer">
                <Button variant="outline" size="sm" asChild>
                  <span>
                    <Upload className="h-4 w-4" />
                    Upload
                  </span>
                </Button>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*,application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadAttachment(file);
                  }}
                />
              </label>
            </CardHeader>
            <CardContent>
              {estimate.attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No attachments.</p>
              ) : (
                <div className="space-y-2">
                  {estimate.attachments.map((a) => (
                    <a
                      key={a.id}
                      href={blobProxyUrl(a.blobUrl) ?? a.blobUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-md border p-3 text-sm hover:bg-muted/50"
                    >
                      <FileText className="h-4 w-4" />
                      {a.fileName}
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Link href={`/customers/${estimate.customer.id}`} className="font-medium text-primary hover:underline">
                <CustomerNameWithBadge
                  name={estimate.customer.name}
                  doNotService={estimate.customer.doNotService}
                />
              </Link>
              {estimate.customer.phone && <p>{estimate.customer.phone}</p>}
              {estimate.customer.email && <p>{estimate.customer.email}</p>}
              {estimate.property && (
                <p className="text-muted-foreground">
                  {estimate.property.name}
                  {estimate.property.address ? ` — ${estimate.property.address}` : ""}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Customer signature</CardTitle>
            </CardHeader>
            <CardContent>
              {estimate.signatureBlobUrl ? (
                <div className="space-y-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={blobProxyUrl(estimate.signatureBlobUrl)}
                    alt="Customer signature"
                    className="max-w-full rounded border"
                  />
                  {estimate.signedAt && (
                    <p className="text-xs text-muted-foreground">
                      Signed {format(new Date(estimate.signedAt), "MMM d, yyyy h:mm a")}
                    </p>
                  )}
                </div>
              ) : (
                <SignaturePad onSave={saveSignature} saving={saving} />
              )}
              {!estimate.signatureBlobUrl ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  A signature is required before this estimate can be approved.
                </p>
              ) : null}
            </CardContent>
          </Card>

          {estimate.status === "APPROVED" ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Next step</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  className="w-full"
                  onClick={() => openPostApproval("today")}
                  disabled={saving}
                >
                  Complete Today
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => openPostApproval("schedule")}
                  disabled={saving}
                >
                  Schedule Visit
                </Button>
              </CardContent>
            </Card>
          ) : null}
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
            <h2 className="text-lg font-semibold">Delete estimate?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This will permanently delete this estimate for {estimate.customer.name}. This cannot be
              undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={deleteEstimate} disabled={deleting}>
                {deleting ? "Deleting..." : "Delete estimate"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <EstimatePostApprovalDialog
        open={postApprovalOpen}
        estimateId={estimateId}
        estimateTotal={optionTotal}
        linkedVisitId={estimate.visit?.id ?? null}
        optionId={activeOptionId}
        initialMode={postApprovalMode}
        onClose={() => setPostApprovalOpen(false)}
        onConverted={() => {
          void load();
        }}
      />

      <ItemPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={addLineItem} />
    </div>
  );
}
