"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PortalShell } from "@/components/portal/PortalShell";

type Gate = {
  videoUrl: string;
  waitSeconds: number;
  gateToken: string;
  canSkipImmediately: boolean;
};

type Company = {
  name: string;
  emailLogoUrl: string | null;
  features: Record<string, boolean>;
};

export function EstimateVslGate({
  slug,
  token,
  gate,
  company,
  authenticated,
  onContinue,
}: {
  slug: string;
  token: string;
  gate: Gate;
  company: Company;
  authenticated: boolean;
  onContinue: () => void;
}) {
  const [remainingSeconds, setRemainingSeconds] = useState(
    gate.canSkipImmediately ? 0 : gate.waitSeconds
  );
  const [videoFinished, setVideoFinished] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const deadline = Date.now() + gate.waitSeconds * 1000;
    setRemainingSeconds(gate.canSkipImmediately ? 0 : gate.waitSeconds);
    setVideoFinished(false);
    if (gate.canSkipImmediately || gate.waitSeconds <= 0) return;

    const update = () => {
      setRemainingSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    };
    const timer = window.setInterval(update, 250);
    update();
    return () => window.clearInterval(timer);
  }, [gate.canSkipImmediately, gate.gateToken, gate.waitSeconds]);

  const unlocked = videoFinished || remainingSeconds <= 0;

  async function continueToEstimate() {
    if (!unlocked) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/portal/estimates/${token}/vsl-viewed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gateToken: gate.gateToken,
          completedVideo: videoFinished,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not open your estimate");
      onContinue();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open your estimate");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalShell
      slug={slug}
      companyName={company.name}
      emailLogoUrl={company.emailLogoUrl}
      features={company.features as never}
      guest={!authenticated}
    >
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-primary">
            A quick message before your estimate
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-storm-navy">
            Watch this short video from {company.name}
          </h1>
        </div>

        <video
          src={gate.videoUrl}
          controls
          playsInline
          preload="auto"
          onEnded={() => setVideoFinished(true)}
          className="aspect-video w-full rounded-xl border border-border bg-black shadow-sm"
        />

        <div className="flex flex-col items-center gap-2">
          <Button
            type="button"
            size="lg"
            className="w-full max-w-sm"
            disabled={!unlocked || submitting}
            onClick={() => void continueToEstimate()}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            See My Estimate →
          </Button>
          {!unlocked ? (
            <p className="text-sm text-muted-foreground">
              Available in {remainingSeconds} second{remainingSeconds === 1 ? "" : "s"}
            </p>
          ) : (
            <p className="text-sm font-medium text-emerald-700">Your estimate is ready.</p>
          )}
        </div>
      </div>
    </PortalShell>
  );
}
