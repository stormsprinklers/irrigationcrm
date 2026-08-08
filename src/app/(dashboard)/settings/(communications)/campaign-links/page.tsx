"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CustomLink = { id: string; label: string; url: string };

type CampaignLinksResponse = {
  bookingUrl: string;
  bookingSlug: string | null;
  privacyPolicyUrl: string;
  termsOfServiceUrl: string;
  custom: CustomLink[];
  allowedLinks: Array<{ key: string; label: string; url: string }>;
};

function newCustomId() {
  return `link_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function CampaignLinksSettingsPage() {
  const [bookingUrl, setBookingUrl] = useState("");
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState("");
  const [termsOfServiceUrl, setTermsOfServiceUrl] = useState("");
  const [custom, setCustom] = useState<CustomLink[]>([]);
  const [bookingSlug, setBookingSlug] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings/campaign-links")
      .then((r) => r.json())
      .then((data: CampaignLinksResponse) => {
        setBookingUrl(data.bookingUrl ?? "");
        setPrivacyPolicyUrl(data.privacyPolicyUrl ?? "");
        setTermsOfServiceUrl(data.termsOfServiceUrl ?? "");
        setCustom(data.custom ?? []);
        setBookingSlug(data.bookingSlug ?? null);
      })
      .catch(() => toast.error("Failed to load campaign links"))
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings/campaign-links", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingUrl: bookingUrl.trim() || null,
          privacyPolicyUrl,
          termsOfServiceUrl,
          custom,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setBookingUrl(data.bookingUrl ?? "");
      setPrivacyPolicyUrl(data.privacyPolicyUrl ?? "");
      setTermsOfServiceUrl(data.termsOfServiceUrl ?? "");
      setCustom(data.custom ?? []);
      toast.success("Campaign links saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Settings", "Communications", "Campaign links"]}
        title="Campaign links"
        subtitle="URLs the email AI may use for buttons and footer links. The AI cannot invent links."
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <form onSubmit={(e) => void save(e)} className="max-w-2xl space-y-6">
          <section className="space-y-4 rounded-lg border bg-white p-4">
            <h2 className="text-sm font-semibold">Built-in links</h2>
            <div>
              <label className="mb-1 block text-sm font-medium">Booking URL</label>
              <Input
                value={bookingUrl}
                onChange={(e) => setBookingUrl(e.target.value)}
                placeholder={
                  bookingSlug
                    ? `Leave blank to use /book/${bookingSlug}`
                    : "https://…"
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Override the public booking page URL, or leave blank to use your booking slug.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Privacy policy</label>
              <Input
                value={privacyPolicyUrl}
                onChange={(e) => setPrivacyPolicyUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Terms of service</label>
              <Input
                value={termsOfServiceUrl}
                onChange={(e) => setTermsOfServiceUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </section>

          <section className="space-y-4 rounded-lg border bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Custom links</h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setCustom((prev) => [...prev, { id: newCustomId(), label: "", url: "" }])
                }
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add link
              </Button>
            </div>
            {custom.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add labeled links (e.g. “Request a quote”, “View offers”) for email CTAs.
              </p>
            ) : (
              <div className="space-y-3">
                {custom.map((link, index) => (
                  <div key={link.id} className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
                    <Input
                      value={link.label}
                      onChange={(e) =>
                        setCustom((prev) =>
                          prev.map((row, i) =>
                            i === index ? { ...row, label: e.target.value } : row
                          )
                        )
                      }
                      placeholder="Label"
                    />
                    <Input
                      value={link.url}
                      onChange={(e) =>
                        setCustom((prev) =>
                          prev.map((row, i) =>
                            i === index ? { ...row, url: e.target.value } : row
                          )
                        )
                      }
                      placeholder="https://…"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setCustom((prev) => prev.filter((_, i) => i !== index))}
                      aria-label="Remove link"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save campaign links"}
          </Button>
        </form>
      )}
    </ContentArea>
  );
}
