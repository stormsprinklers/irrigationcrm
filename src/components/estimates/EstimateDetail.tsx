"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import {
  ArrowLeft,
  Copy,
  FileText,
  Loader2,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { ItemPicker } from "@/components/price-book/ItemPicker";
import { CustomerNameWithBadge } from "@/components/customers/CustomerNameWithBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { blobProxyUrl } from "@/lib/blob/urls";
import type { PriceBookItemDTO } from "@/lib/price-book/types";

type EstimateData = {
  id: string;
  status: string;
  expiresAt: string | null;
  depositRequired: boolean;
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
  lineItems: Array<{
    id: string;
    name: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  discounts: Array<{
    id: string;
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
};

type Props = { estimateId: string };

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function SignaturePad({ onSave, saving }: { onSave: (dataUrl: string) => Promise<void>; saving: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  }, []);

  function getPoint(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const touch = e.touches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    const point = getPoint(e);
    ctx?.beginPath();
    ctx?.moveTo(point.x, point.y);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    const point = getPoint(e);
    ctx?.lineTo(point.x, point.y);
    ctx?.stroke();
  }

  function stopDraw() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    await onSave(canvas.toDataURL("image/png"));
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={500}
        height={160}
        className="w-full rounded-md border border-border bg-white touch-none"
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
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save signature"}
        </Button>
      </div>
    </div>
  );
}

export function EstimateDetail({ estimateId }: Props) {
  const router = useRouter();
  const { data: session } = useSession();
  const canDelete = session?.user?.role !== "TECH";
  const [estimate, setEstimate] = useState<EstimateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [discountLabel, setDiscountLabel] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountType, setDiscountType] = useState<"PERCENT" | "FIXED">("FIXED");
  const [saving, setSaving] = useState(false);
  const [copyVisitId, setCopyVisitId] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/estimates/${estimateId}`);
    if (res.ok) setEstimate(await res.json());
  }, [estimateId]);

  useEffect(() => {
    load()
      .catch(() => toast.error("Failed to load estimate"))
      .finally(() => setLoading(false));
  }, [load]);

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
        }),
      });
      if (!res.ok) {
        toast.error("Failed to add line item");
        return;
      }
      setEstimate(await res.json());
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
        toast.error("Failed to save signature");
        return;
      }
      setEstimate(await res.json());
      toast.success("Signature saved");
    } finally {
      setSaving(false);
    }
  }

  async function copyToVisit(target: "this_visit" | "new_visit", visitIdOverride?: string) {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { target };
      if (target === "this_visit") {
        const vid = visitIdOverride ?? copyVisitId.trim() ?? estimate?.visit?.id;
        if (!vid) {
          toast.error("Enter a visit ID");
          return;
        }
        body.visitId = vid;
      } else {
        body.schedule = {
          title: `Work from estimate`,
          startAt: new Date().toISOString(),
          endAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          division: "SERVICE",
          zip: estimate?.property?.address ? undefined : undefined,
        };
      }

      const res = await fetch(`/api/estimates/${estimateId}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        toast.error("Failed to copy to visit");
        return;
      }
      const data = await res.json();
      toast.success("Copied to visit");
      window.location.href = `/visits/${data.visitId}`;
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
            <CustomerNameWithBadge
              name={estimate.customer.name}
              doNotService={estimate.customer.doNotService}
              nameClassName="text-2xl font-semibold"
            />
            <Badge variant="outline">{estimate.status}</Badge>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              copyToVisit(estimate.visit ? "this_visit" : "new_visit", estimate.visit?.id)
            }
            disabled={saving}
          >
            <Copy className="h-4 w-4" />
            Copy to visit
          </Button>
          {canDelete ? (
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)} disabled={saving}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Line items</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)} disabled={saving}>
                Add item
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {estimate.lineItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No line items yet.</p>
              ) : (
                estimate.lineItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-muted-foreground">
                        {item.quantity} × {formatCurrency(item.unitPrice)}
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
                  <span>{formatCurrency(estimate.subtotal)}</span>
                </div>
                {estimate.discountTotal > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Discounts</span>
                    <span>-{formatCurrency(estimate.discountTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(estimate.total)}</span>
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
              {estimate.discounts.map((d) => (
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
              <CardTitle className="text-base">Signature</CardTitle>
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
            </CardContent>
          </Card>

          {estimate.visit && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Copy to visit</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Input
                  value={copyVisitId || estimate.visit.id}
                  onChange={(e) => setCopyVisitId(e.target.value)}
                  placeholder="Visit ID"
                />
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => {
                    const visitId = copyVisitId || estimate.visit?.id;
                    if (visitId) copyToVisit("this_visit", visitId);
                  }}
                  disabled={saving}
                >
                  Copy line items to visit
                </Button>
              </CardContent>
            </Card>
          )}
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

      <ItemPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={addLineItem} />
    </div>
  );
}
