"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PortalShell } from "./PortalShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ReferralsResponse = {
  programEnabled: boolean;
  enrolled: boolean;
  member: {
    id: string;
    enrolledAt: string;
    stripeConnectOnboarded: boolean;
    shareUrl: string | null;
  } | null;
  settings: {
    headline: string | null;
    terms: string | null;
    installRewardCents: number;
    serviceRewardCents: number;
  } | null;
  submissions: Array<{
    id: string;
    referredName: string;
    status: string;
    rewardCents: number | null;
    rewardStatus: string | null;
    createdAt: string;
  }>;
};

function formatReward(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function PortalReferralsPanel({ slug }: { slug: string }) {
  const [me, setMe] = useState<{ company: { name: string; emailLogoUrl: string | null; features: Record<string, boolean> } } | null>(null);
  const [data, setData] = useState<ReferralsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  async function load() {
    const [meRes, refRes] = await Promise.all([
      fetch("/api/portal/me"),
      fetch("/api/portal/referrals"),
    ]);
    if (!meRes.ok || !refRes.ok) throw new Error("Failed to load");
    const [meData, refData] = await Promise.all([meRes.json(), refRes.json()]);
    setMe(meData);
    setData(refData);
  }

  useEffect(() => {
    load()
      .catch(() => toast.error("Could not load referrals"))
      .finally(() => setLoading(false));
  }, []);

  async function copyLink() {
    if (!data?.member?.shareUrl) return;
    await navigator.clipboard.writeText(data.member.shareUrl);
    toast.success("Link copied");
  }

  async function startConnect() {
    setConnecting(true);
    try {
      const res = await fetch("/api/portal/referrals/connect", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Setup failed");
      window.location.href = body.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Setup failed");
    } finally {
      setConnecting(false);
    }
  }

  async function submitReferral(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/portal/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Submit failed");
      toast.success("Referral submitted!");
      setName("");
      setPhone("");
      setEmail("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !me) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  if (!data?.programEnabled) {
    return (
      <PortalShell slug={slug} companyName={me.company.name} emailLogoUrl={me.company.emailLogoUrl} features={me.company.features as never}>
        <p className="text-sm text-muted-foreground">The referral program is not active right now.</p>
      </PortalShell>
    );
  }

  return (
    <PortalShell slug={slug} companyName={me.company.name} emailLogoUrl={me.company.emailLogoUrl} features={me.company.features as never}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Refer a friend</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.settings?.headline ?? "Share your link and earn rewards when friends become customers."}
          </p>
          {data.settings ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Earn {formatReward(data.settings.installRewardCents)} for install visits and{" "}
              {formatReward(data.settings.serviceRewardCents)} for service visits.
            </p>
          ) : null}
        </div>

        {data.member?.shareUrl ? (
          <section className="portal-card space-y-3">
            <h2 className="portal-section-title">Your share link</h2>
            <div className="flex flex-wrap gap-2">
              <Input readOnly value={data.member.shareUrl} className="font-mono text-xs" />
              <Button type="button" variant="outline" size="sm" onClick={() => void copyLink()}>
                <Copy className="mr-1 h-4 w-4" />
                Copy
              </Button>
            </div>
            {!data.member.stripeConnectOnboarded ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="font-medium text-amber-900">Complete payout setup to receive rewards.</p>
                <Button className="mt-2" size="sm" onClick={() => void startConnect()} disabled={connecting}>
                  {connecting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                  Set up payouts
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="portal-card space-y-3">
          <h2 className="portal-section-title">Refer someone directly</h2>
          <form onSubmit={(e) => void submitReferral(e)} className="space-y-3">
            <div>
              <label htmlFor="ref-name" className="mb-1 block text-sm font-medium">
                Friend&apos;s name *
              </label>
              <Input id="ref-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="ref-phone" className="mb-1 block text-sm font-medium">
                Phone
              </label>
              <Input id="ref-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label htmlFor="ref-email" className="mb-1 block text-sm font-medium">
                Email
              </label>
              <Input id="ref-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {data.settings?.terms ? (
              <p className="text-xs text-muted-foreground">{data.settings.terms}</p>
            ) : null}
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Submit referral
            </Button>
          </form>
        </section>

        <section className="portal-card">
          <h2 className="portal-section-title mb-3">Your referrals</h2>
          {data.submissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No referrals yet.</p>
          ) : (
            <ul className="divide-y">
              {data.submissions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div>
                    <p className="font-medium">{s.referredName}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(s.createdAt), "MMM d, yyyy")}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="secondary">{s.status.replace(/_/g, " ")}</Badge>
                    {s.rewardCents ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatReward(s.rewardCents)}
                        {s.rewardStatus ? ` · ${s.rewardStatus}` : ""}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PortalShell>
  );
}
