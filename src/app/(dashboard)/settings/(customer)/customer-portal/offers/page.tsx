"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { blobProxyUrl } from "@/lib/blob/urls";
import { toast } from "sonner";

type Offer = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  active: boolean;
  sortOrder: number;
};

const emptyForm = {
  title: "",
  description: "",
  imageUrl: "",
  ctaLabel: "",
  ctaUrl: "",
  active: true,
};

export default function PortalOffersSettingsPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch("/api/settings/portal-offers");
    const data = await res.json();
    setOffers(data.offers ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function uploadPhoto(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/settings/portal-offers/upload", {
        method: "POST",
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to upload photo");
        return;
      }
      setForm((prev) => ({ ...prev, imageUrl: data.url as string }));
      toast.success("Photo uploaded");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function createOffer(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/settings/portal-offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        description: form.description || null,
        imageUrl: form.imageUrl || null,
        ctaLabel: form.ctaLabel || null,
        ctaUrl: form.ctaUrl || null,
        active: form.active,
      }),
    });
    if (!res.ok) {
      toast.error("Failed to create offer");
      return;
    }
    setForm(emptyForm);
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

  const previewSrc = form.imageUrl ? blobProxyUrl(form.imageUrl) ?? form.imageUrl : null;

  return (
    <ContentArea className="max-w-2xl">
      <PageHeader
        breadcrumb={["Settings", "Customer Portal", "Offers"]}
        title="Portal offers"
        subtitle="Photo cards with title, description, button, and link for the customer portal"
      />

      <form onSubmit={createOffer} className="mb-8 space-y-3 rounded-lg border border-border bg-white p-6">
        <h2 className="font-medium">New offer</h2>
        <Input
          placeholder="Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />
        <textarea
          className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />

        <div>
          <p className="mb-2 text-sm font-medium">Photo</p>
          {previewSrc ? (
            <div className="relative mb-2 overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewSrc} alt="" className="max-h-48 w-full object-cover" />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute right-2 top-2 h-8 w-8"
                onClick={() => setForm({ ...form, imageUrl: "" })}
                aria-label="Remove photo"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadPhoto(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="mr-2 h-4 w-4" />
            )}
            {previewSrc ? "Replace photo" : "Add photo"}
          </Button>
        </div>

        <Input
          placeholder="Button label (e.g. Claim rebate)"
          value={form.ctaLabel}
          onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })}
        />
        <Input
          placeholder="Button / card link URL"
          value={form.ctaUrl}
          onChange={(e) => setForm({ ...form, ctaUrl: e.target.value })}
        />
        <Button type="submit" disabled={uploading}>
          Add offer
        </Button>
      </form>

      <ul className="space-y-3">
        {offers.map((o) => {
          const thumb = o.imageUrl ? blobProxyUrl(o.imageUrl) ?? o.imageUrl : null;
          return (
            <li
              key={o.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-white p-4"
            >
              <div className="flex min-w-0 flex-1 gap-3">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt=""
                    className="h-16 w-24 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">
                    No photo
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium">{o.title}</p>
                  {o.description ? (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{o.description}</p>
                  ) : null}
                  {o.ctaUrl ? (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {o.ctaLabel || "Learn more"} → {o.ctaUrl}
                    </p>
                  ) : null}
                </div>
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
          );
        })}
      </ul>
    </ContentArea>
  );
}
