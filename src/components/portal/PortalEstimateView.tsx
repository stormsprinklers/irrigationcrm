"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PortalShell } from "./PortalShell";
import { DesignZoneViewer } from "@/components/design/DesignZoneViewer";

type Estimate = {
  id: string;
  publicToken: string;
  status: string;
  total: number;
  subtotal: number;
  discountTotal: number;
  expiresAt: string | null;
  signedAt: string | null;
  depositRequired: boolean;
  hasDesign: boolean;
  premiumOptionTotal: number | null;
  lineItems: Array<{
    name: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
};

export function PortalEstimateView({ slug, token }: { slug: string; token: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [me, setMe] = useState<{ company: { name: string; emailLogoUrl: string | null; features: Record<string, boolean> } } | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [designSnapshot, setDesignSnapshot] = useState<Record<string, unknown> | null>(null);
  const [selectedTier, setSelectedTier] = useState<"STANDARD" | "PREMIUM">("STANDARD");
  const [drawing, setDrawing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/portal/me").then((r) => r.json()),
      fetch(`/api/portal/estimates/${token}`).then((r) => r.json()),
    ]).then(async ([meData, estData]) => {
      setMe(meData);
      setEstimate(estData.estimate);
      if (estData.estimate?.hasDesign) {
        const designRes = await fetch(`/api/portal/estimates/${token}/design`);
        if (designRes.ok) {
          const designData = await designRes.json();
          setDesignSnapshot(designData.design?.snapshot ?? null);
        }
      }
    });
  }, [token]);

  function displayTotal() {
    if (!estimate) return 0;
    if (selectedTier === "PREMIUM" && estimate.premiumOptionTotal != null) {
      return estimate.premiumOptionTotal;
    }
    const standard = estimate.lineItems.find((i) => i.name.toLowerCase().includes("standard"));
    return standard?.total ?? estimate.total;
  }

  function startDraw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  async function sign() {
    const canvas = canvasRef.current;
    if (!canvas || !estimate) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/estimates/${token}/signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature: canvas.toDataURL("image/png"),
          selectedQuoteTier: selectedTier,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to sign");
      setEstimate(data.estimate);
      toast.success("Estimate approved");
      if (data.depositCheckoutUrl) {
        window.location.href = data.depositCheckoutUrl;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to sign");
    } finally {
      setLoading(false);
    }
  }

  async function payDeposit() {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/estimates/${token}/deposit`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Deposit failed");
      if (data.url) window.location.href = data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Deposit failed");
    } finally {
      setLoading(false);
    }
  }

  if (!me || !estimate) return <p className="text-sm text-muted-foreground">Loading...</p>;

  const canSign = estimate.status === "SENT";
  const needsDeposit = estimate.status === "APPROVED" && estimate.depositRequired;

  return (
    <PortalShell slug={slug} companyName={me.company.name} emailLogoUrl={me.company.emailLogoUrl} features={me.company.features as never}>
      <div className="space-y-6">
        <Link href={`/portal/${slug}`} className="text-sm text-primary hover:underline">
          ← Back to portal
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">Your proposal</h1>
          <p className="text-sm text-muted-foreground capitalize">{estimate.status.toLowerCase()}</p>
          {estimate.expiresAt ? (
            <p className="text-sm">Expires {format(new Date(estimate.expiresAt), "MMM d, yyyy")}</p>
          ) : null}
        </div>

        {estimate.hasDesign && designSnapshot ? (
          <section className="space-y-2">
            <h2 className="text-sm font-medium">System layout</h2>
            <p className="text-xs text-muted-foreground">Click each zone to see sprinkler head locations.</p>
            <DesignZoneViewer snapshot={designSnapshot as never} />
          </section>
        ) : null}

        {canSign && estimate.premiumOptionTotal != null ? (
          <section className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className={`rounded-lg border p-4 text-left ${selectedTier === "STANDARD" ? "border-primary ring-2 ring-primary/30" : ""}`}
              onClick={() => setSelectedTier("STANDARD")}
            >
              <p className="font-medium">Standard</p>
              <p className="text-sm text-muted-foreground">Quality irrigation system installation</p>
            </button>
            <button
              type="button"
              className={`rounded-lg border p-4 text-left ${selectedTier === "PREMIUM" ? "border-primary ring-2 ring-primary/30" : ""}`}
              onClick={() => setSelectedTier("PREMIUM")}
            >
              <p className="font-medium">Premium</p>
              <p className="text-sm text-muted-foreground">
                PRS heads, flow & weather sensors, 1-year maintenance
              </p>
              <p className="mt-2 font-semibold">${estimate.premiumOptionTotal.toFixed(2)}</p>
            </button>
          </section>
        ) : (
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Total investment</p>
            <p className="text-2xl font-semibold">${displayTotal().toFixed(2)}</p>
          </div>
        )}

        {canSign ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Sign to approve ({selectedTier === "PREMIUM" ? "Premium" : "Standard"})</p>
            <p className="text-lg font-semibold">${displayTotal().toFixed(2)}</p>
            <canvas
              ref={canvasRef}
              width={400}
              height={120}
              className="w-full max-w-md touch-none rounded border border-border bg-white"
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={() => setDrawing(false)}
              onMouseLeave={() => setDrawing(false)}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={() => setDrawing(false)}
            />
            <Button onClick={() => void sign()} disabled={loading}>
              {loading ? "Submitting..." : estimate.depositRequired ? "Approve & pay deposit" : "Approve estimate"}
            </Button>
          </div>
        ) : needsDeposit ? (
          <Button onClick={() => void payDeposit()} disabled={loading}>
            {loading ? "Loading..." : "Pay deposit to book installation"}
          </Button>
        ) : estimate.signedAt ? (
          <p className="text-sm text-muted-foreground">Signed on {format(new Date(estimate.signedAt), "MMM d, yyyy")}</p>
        ) : null}
      </div>
    </PortalShell>
  );
}
