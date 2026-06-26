"use client";

import { useEffect, useState } from "react";
import { UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressAutocompleteInput } from "@/components/customers/AddressFields";
import { formatPhoneDisplay } from "@/lib/inbox/phone";
import type { ParsedSmsContactInfo } from "@/lib/inbox/contact-info-types";

type Props = {
  open: boolean;
  messageId: string;
  onClose: () => void;
  onApplied: (customer: { id: string; name: string; phone?: string | null; email?: string | null }) => void;
};

export function AddContactInfoDialog({ open, messageId, onClose, onApplied }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fallbackPhone, setFallbackPhone] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    homeAddress: "",
    email: "",
    phone: "",
  });

  useEffect(() => {
    if (!open || !messageId) return;

    setLoading(true);
    fetch(`/api/inbox/sms/messages/${messageId}/contact-info`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to parse contact info");
        }
        const parsed = data.parsed as ParsedSmsContactInfo;
        setFallbackPhone(data.fallbackPhone ?? null);
        setForm({
          firstName: parsed.firstName ?? "",
          lastName: parsed.lastName ?? "",
          homeAddress: parsed.homeAddress ?? "",
          email: parsed.email ?? "",
          phone: parsed.phone ?? data.fallbackPhone ?? "",
        });
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to load contact info");
        onClose();
      })
      .finally(() => setLoading(false));
  }, [open, messageId, onClose]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/inbox/sms/messages/${messageId}/contact-info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save contact info");
        return;
      }
      toast.success("Contact info saved");
      if (data.customer) onApplied(data.customer);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-lg border bg-background shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Add contact info</h2>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 p-4">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Parsing contact info from message...
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Review fields extracted from this message. Phone defaults to the texting number when
                not provided.
                {fallbackPhone ? (
                  <>
                    {" "}
                    Texting from{" "}
                    <span className="font-medium text-foreground">
                      {formatPhoneDisplay(fallbackPhone)}
                    </span>
                    .
                  </>
                ) : null}
              </p>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    First name
                  </label>
                  <Input
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    autoComplete="given-name"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Last name
                  </label>
                  <Input
                    value={form.lastName}
                    onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                    autoComplete="family-name"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Home address
                </label>
                <AddressAutocompleteInput
                  value={form.homeAddress}
                  onChange={(homeAddress) => setForm((f) => ({ ...f, homeAddress }))}
                  onResolved={(resolved) =>
                    setForm((f) => ({
                      ...f,
                      homeAddress: resolved.formattedAddress || f.homeAddress,
                    }))
                  }
                  placeholder="Start typing an address..."
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Pick a suggestion to autofill, or type the address manually.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Email
                </label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Phone
                </label>
                <Input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  autoComplete="tel"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save to customer"}
                </Button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
