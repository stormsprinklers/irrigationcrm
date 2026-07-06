"use client";

import { useEffect, useState } from "react";
import { Copy, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  customerId: string;
  disabled?: boolean;
};

export function CustomerReferralsSection({ customerId, disabled }: Props) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    fetch(`/api/customers/${customerId}/referrals`)
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.shareUrl) {
          setShareUrl(data.shareUrl);
          setEnrolled(true);
        }
      })
      .finally(() => setLoading(false));
  }, [customerId]);

  async function enroll() {
    setEnrolling(true);
    try {
      const res = await fetch("/api/marketing/referrals/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Enroll failed");
      setShareUrl(data.shareUrl);
      setEnrolled(true);
      toast.success(data.created ? "Enrolled in referrals" : "Already enrolled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enroll failed");
    } finally {
      setEnrolling(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    toast.success("Referral link copied");
  }

  if (loading) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" />
          Referrals
        </CardTitle>
        {enrolled ? <Badge variant="secondary">Enrolled</Badge> : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {enrolled && shareUrl ? (
          <>
            <p className="text-sm text-muted-foreground">
              Share this link so friends can request service and earn referral rewards.
            </p>
            <div className="flex flex-wrap gap-2">
              <code className="flex-1 truncate rounded border bg-muted px-2 py-1 text-xs">{shareUrl}</code>
              <Button type="button" size="sm" variant="outline" onClick={() => void copyLink()}>
                <Copy className="mr-1 h-4 w-4" />
                Copy
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Enroll this customer in the referral program to generate a personal share link.
            </p>
            <Button type="button" size="sm" onClick={() => void enroll()} disabled={disabled || enrolling}>
              {enrolling ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Enroll in referrals
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
