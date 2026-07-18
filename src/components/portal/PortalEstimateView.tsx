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
  estimateNumber: string | null;
  publicToken: string;
  status: string;
  selectedOptionId: string | null;
  total: number;
  subtotal: number;
  discountTotal: number;
  expiresAt: string | null;
  signedAt: string | null;
  depositRequired: boolean;
  hasDesign: boolean;
  premiumOptionTotal: number | null;
  options: Array<{
    id: string;
    label: string;
    displayNumber: string;
    total: number;
  }>;
  lineItems: Array<{
    optionId?: string | null;
    name: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
};

type CompanyBranding = {
  name: string;
  emailLogoUrl: string | null;
  features: Record<string, boolean>;
};

export function PortalEstimateView({ slug, token }: { slug: string; token: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasInk = useRef(false);
  const [company, setCompany] = useState<CompanyBranding | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [designSnapshot, setDesignSnapshot] = useState<Record<string, unknown> | null>(null);
  const [selectedTier, setSelectedTier] = useState<"STANDARD" | "PREMIUM">("STANDARD");
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setPageLoading(true);
      setError(null);
      try {
        const estRes = await fetch(`/api/portal/estimates/${token}`);
        const estData = await estRes.json().catch(() => ({}));
        if (!estRes.ok || !estData.estimate) {
          if (!cancelled) {
            setError(estData.error ?? "This estimate link is invalid or no longer available.");
            setEstimate(null);
            setCompany(null);
          }
          return;
        }
        if (cancelled) return;
        setEstimate(estData.estimate);
        setCompany(estData.company ?? null);
        setAuthenticated(Boolean(estData.authenticated));
        setSelectedOptionId(
          estData.estimate.selectedOptionId ?? estData.estimate.options?.[0]?.id ?? null
        );

        if (estData.estimate?.hasDesign) {
          const designRes = await fetch(`/api/portal/estimates/${token}/design`);
          if (designRes.ok) {
            const designData = await designRes.json();
            if (!cancelled) {
              setDesignSnapshot(designData.design?.snapshot ?? null);
            }
          }
        }
      } catch {
        if (!cancelled) {
          setError("Could not load this estimate. Please try again.");
        }
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  function displayTotal() {
    if (!estimate) return 0;
    if (estimate.options?.length) {
      const option =
        estimate.options.find((o) => o.id === selectedOptionId) ?? estimate.options[0];
      if (option) return option.total;
    }
    if (selectedTier === "PREMIUM" && estimate.premiumOptionTotal != null) {
      return estimate.premiumOptionTotal;
    }
    const standard = estimate.lineItems.find((i) => i.name.toLowerCase().includes("standard"));
    return standard?.total ?? estimate.total;
  }

  function getPoint(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
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

  function startDraw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setDrawing(true);
    const point = getPoint(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const point = getPoint(e);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    hasInk.current = true;
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
  }

  async function sign() {
    const canvas = canvasRef.current;
    if (!canvas || !estimate) return;
    if (!hasInk.current) {
      toast.error("Please sign before approving");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/estimates/${token}/signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature: canvas.toDataURL("image/png"),
          selectedQuoteTier: selectedTier,
          selectedOptionId,
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

  if (pageLoading) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <p className="text-sm text-muted-foreground">Loading your estimate…</p>
      </main>
    );
  }

  if (error || !estimate || !company) {
    return (
      <main className="mx-auto max-w-lg space-y-3 p-8">
        <h1 className="text-xl font-semibold text-storm-navy">Estimate unavailable</h1>
        <p className="text-sm text-muted-foreground">
          {error ?? "This estimate link is invalid or no longer available."}
        </p>
      </main>
    );
  }

  const canSign = estimate.status === "SENT";
  const needsDeposit = estimate.status === "APPROVED" && estimate.depositRequired;

  return (
    <PortalShell
      slug={slug}
      companyName={company.name}
      emailLogoUrl={company.emailLogoUrl}
      features={company.features as never}
      guest={!authenticated}
    >
      <div className="space-y-6">
        {authenticated ? (
          <Link href={`/portal/${slug}`} className="text-sm text-primary hover:underline">
            ← Back to portal
          </Link>
        ) : null}
        <div>
          <h1 className="text-2xl font-semibold">
            {estimate.options?.length > 1
              ? "Your proposal options"
              : estimate.estimateNumber
                ? `Proposal ${estimate.estimateNumber}`
                : "Your proposal"}
          </h1>
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

        {canSign && (estimate.options?.length ?? 0) > 1 ? (
          <section className="grid gap-3 sm:grid-cols-2">
            {estimate.options.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`rounded-lg border p-4 text-left ${
                  selectedOptionId === option.id ? "border-primary ring-2 ring-primary/30" : ""
                }`}
                onClick={() => setSelectedOptionId(option.id)}
              >
                <p className="font-medium">{option.displayNumber}</p>
                <p className="text-sm text-muted-foreground">{option.label}</p>
                <p className="mt-2 font-semibold">${option.total.toFixed(2)}</p>
              </button>
            ))}
          </section>
        ) : canSign && estimate.premiumOptionTotal != null ? (
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
            <p className="text-sm font-medium">
              Sign to approve
              {(estimate.options?.length ?? 0) > 1
                ? ` (${estimate.options.find((o) => o.id === selectedOptionId)?.displayNumber ?? "option"})`
                : selectedTier === "PREMIUM"
                  ? " (Premium)"
                  : estimate.premiumOptionTotal != null
                    ? " (Standard)"
                    : ""}
            </p>
            <p className="text-lg font-semibold">${displayTotal().toFixed(2)}</p>
            <p className="text-sm text-muted-foreground">Sign with your finger in the box below.</p>
            <canvas
              ref={canvasRef}
              width={700}
              height={240}
              className="h-48 w-full max-w-md touch-none rounded border border-border bg-white sm:h-56"
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={() => setDrawing(false)}
              onMouseLeave={() => setDrawing(false)}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={() => setDrawing(false)}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={clearSignature} disabled={loading}>
                Clear
              </Button>
              <Button onClick={() => void sign()} disabled={loading}>
                {loading ? "Submitting..." : estimate.depositRequired ? "Approve & pay deposit" : "Approve estimate"}
              </Button>
            </div>
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
