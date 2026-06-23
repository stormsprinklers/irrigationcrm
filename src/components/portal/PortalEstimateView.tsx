"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PortalShell } from "./PortalShell";

type Estimate = {
  id: string;
  publicToken: string;
  status: string;
  total: number;
  subtotal: number;
  discountTotal: number;
  expiresAt: string | null;
  signedAt: string | null;
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
  const [drawing, setDrawing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/portal/me").then((r) => r.json()),
      fetch(`/api/portal/estimates/${token}`).then((r) => r.json()),
    ]).then(([meData, estData]) => {
      setMe(meData);
      setEstimate(estData.estimate);
    });
  }, [token]);

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
        body: JSON.stringify({ signature: canvas.toDataURL("image/png") }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to sign");
      setEstimate(data.estimate);
      toast.success("Estimate approved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to sign");
    } finally {
      setLoading(false);
    }
  }

  if (!me || !estimate) return <p className="text-sm text-muted-foreground">Loading...</p>;

  const canSign = estimate.status === "SENT";

  return (
    <PortalShell slug={slug} companyName={me.company.name} emailLogoUrl={me.company.emailLogoUrl} features={me.company.features as never}>
      <div className="space-y-6">
        <Link href={`/portal/${slug}`} className="text-sm text-primary hover:underline">
          ← Back to portal
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">Estimate</h1>
          <p className="text-sm text-muted-foreground capitalize">{estimate.status.toLowerCase()}</p>
          {estimate.expiresAt ? (
            <p className="text-sm">Expires {format(new Date(estimate.expiresAt), "MMM d, yyyy")}</p>
          ) : null}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Item</th>
              <th className="py-2">Qty</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {estimate.lineItems.map((item, i) => (
              <tr key={i} className="border-b">
                <td className="py-2">
                  {item.name}
                  {item.description ? <p className="text-xs text-muted-foreground">{item.description}</p> : null}
                </td>
                <td className="py-2">{item.quantity}</td>
                <td className="py-2 text-right">${item.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="py-2 font-medium">
                Total
              </td>
              <td className="py-2 text-right font-medium">${estimate.total.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        {canSign ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Sign to approve</p>
            <canvas
              ref={canvasRef}
              width={400}
              height={120}
              className="w-full max-w-md rounded border border-border bg-white touch-none"
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={() => setDrawing(false)}
              onMouseLeave={() => setDrawing(false)}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={() => setDrawing(false)}
            />
            <Button onClick={() => void sign()} disabled={loading}>
              {loading ? "Submitting..." : "Approve estimate"}
            </Button>
          </div>
        ) : estimate.signedAt ? (
          <p className="text-sm text-muted-foreground">Signed on {format(new Date(estimate.signedAt), "MMM d, yyyy")}</p>
        ) : null}
      </div>
    </PortalShell>
  );
}
