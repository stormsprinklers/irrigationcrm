"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type ContactList = { id: string; name: string; memberCount: number };

export default function NewCampaignPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    channel: "SMS" as "SMS" | "EMAIL",
    listId: "",
    subject: "",
    bodyText: "",
  });

  useEffect(() => {
    fetch("/api/contact-lists")
      .then((r) => r.json())
      .then((data) => setLists(data.lists ?? []))
      .catch(() => {});
  }, []);

  async function createCampaign(sendNow: boolean) {
    if (!form.name.trim() || !form.bodyText.trim()) {
      toast.error("Name and message are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          channel: form.channel,
          listId: form.listId || null,
          subject: form.channel === "EMAIL" ? form.subject : null,
          bodyText: form.bodyText,
        }),
      });
      const campaign = await res.json();
      if (!res.ok) throw new Error(campaign.error ?? "Failed to create");

      if (sendNow) {
        const sendRes = await fetch(`/api/campaigns/${campaign.id}/send`, { method: "POST" });
        if (!sendRes.ok) {
          const err = await sendRes.json();
          toast.error(err.error ?? "Send failed");
        } else {
          toast.success("Campaign sent");
        }
      } else {
        toast.success("Campaign saved as draft");
      }

      router.push(`/campaigns/${campaign.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ContentArea className="max-w-2xl">
      <PageHeader breadcrumb={["Campaigns", "New"]} title="New campaign" />
      <div className="space-y-6 rounded-lg border border-border bg-white p-6">
        <div className="flex gap-2 text-xs text-muted-foreground">
          <span className={step >= 1 ? "font-medium text-foreground" : ""}>1. Channel</span>
          <span className={step >= 2 ? "font-medium text-foreground" : ""}>2. Audience</span>
          <span className={step >= 3 ? "font-medium text-foreground" : ""}>3. Message</span>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">Campaign name</label>
              <Input
                className="mt-1"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="flex gap-3">
              {(["SMS", "EMAIL"] as const).map((ch) => (
                <Button
                  key={ch}
                  variant={form.channel === ch ? "default" : "outline"}
                  onClick={() => setForm({ ...form, channel: ch })}
                >
                  {ch}
                </Button>
              ))}
            </div>
            <Button disabled={!form.name.trim()} onClick={() => setStep(2)}>
              Continue
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">Contact list</label>
              <select
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={form.listId}
                onChange={(e) => setForm({ ...form, listId: e.target.value })}
              >
                <option value="">All customers</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.memberCount} members)
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={() => setStep(3)}>Continue</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            {form.channel === "EMAIL" && (
              <div>
                <label className="text-sm text-muted-foreground">Subject</label>
                <Input
                  className="mt-1"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                />
              </div>
            )}
            <div>
              <label className="text-sm text-muted-foreground">Message</label>
              <textarea
                className="mt-1 flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={form.bodyText}
                onChange={(e) => setForm({ ...form, bodyText: e.target.value })}
                placeholder={
                  form.channel === "SMS"
                    ? "Your SMS message. Reply STOP to opt out will be appended."
                    : "Your email message"
                }
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button variant="outline" disabled={saving} onClick={() => createCampaign(false)}>
                Save draft
              </Button>
              <Button disabled={saving} onClick={() => createCampaign(true)}>
                {saving ? "Sending..." : "Send now"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </ContentArea>
  );
}
