"use client";

import { useEffect, useState } from "react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

type Offer = {
  id: string;
  title: string;
  description: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  active: boolean;
  sortOrder: number;
};

export default function PortalOffersSettingsPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    ctaLabel: "",
    ctaUrl: "",
    active: true,
  });

  async function load() {
    const res = await fetch("/api/settings/portal-offers");
    const data = await res.json();
    setOffers(data.offers ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createOffer(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/settings/portal-offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      toast.error("Failed to create offer");
      return;
    }
    setForm({ title: "", description: "", ctaLabel: "", ctaUrl: "", active: true });
    toast.success("Offer created");
    void load();
  }

  async function toggleActive(offer: Offer) {
    await fetch(`/api/settings/portal-offers/${offer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !offer.active }),
    });
    void load();
  }

  async function removeOffer(id: string) {
    if (!confirm("Delete this offer?")) return;
    await fetch(`/api/settings/portal-offers/${id}`, { method: "DELETE" });
    void load();
  }

  return (
    <ContentArea className="max-w-2xl">
      <PageHeader
        breadcrumb={["Settings", "Customer Portal", "Offers"]}
        title="Portal offers"
      />

      <form onSubmit={createOffer} className="mb-8 space-y-3 rounded-lg border border-border bg-white p-6">
        <h2 className="font-medium">New offer</h2>
        <Input
          placeholder="Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />
        <Input
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <Input
          placeholder="Button label"
          value={form.ctaLabel}
          onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })}
        />
        <Input
          placeholder="Button URL"
          value={form.ctaUrl}
          onChange={(e) => setForm({ ...form, ctaUrl: e.target.value })}
        />
        <Button type="submit">Add offer</Button>
      </form>

      <ul className="space-y-3">
        {offers.map((o) => (
          <li key={o.id} className="flex items-center justify-between rounded-lg border border-border bg-white p-4">
            <div>
              <p className="font-medium">{o.title}</p>
              {o.description ? <p className="text-sm text-muted-foreground">{o.description}</p> : null}
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs">
                <Checkbox checked={o.active} onCheckedChange={() => void toggleActive(o)} />
                Active
              </label>
              <Button variant="ghost" size="sm" onClick={() => void removeOffer(o.id)}>
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </ContentArea>
  );
}
