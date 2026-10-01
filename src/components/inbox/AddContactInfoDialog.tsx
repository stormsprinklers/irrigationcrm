"use client";

import { useEffect, useRef, useState } from "react";
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

type TargetCustomer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  phones: Array<{ id: string; phone: string; note: string | null }>;
  emails: Array<{ id: string; email: string; note: string | null }>;
};

type FieldAction = "" | "keep" | "replace" | "secondary";
type FieldActions = Record<"name" | "phone" | "email" | "address", FieldAction>;

const EMPTY_ACTIONS: FieldActions = {
  name: "",
  phone: "",
  email: "",
  address: "",
};

function sameText(left: string | null | undefined, right: string | null | undefined) {
  return String(left ?? "").trim().toLowerCase() === String(right ?? "").trim().toLowerCase();
}

function samePhone(left: string | null | undefined, right: string | null | undefined) {
  const digits = (value: string | null | undefined) => String(value ?? "").replace(/\D/g, "").slice(-10);
  const leftDigits = digits(left);
  return Boolean(leftDigits && leftDigits === digits(right));
}

export function AddContactInfoDialog({ open, messageId, onClose, onApplied }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fallbackPhone, setFallbackPhone] = useState<string | null>(null);
  const [targetCustomer, setTargetCustomer] = useState<TargetCustomer | null>(null);
  const [fieldActions, setFieldActions] = useState<FieldActions>(EMPTY_ACTIONS);
  const onCloseRef = useRef(onClose);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    homeAddress: "",
    email: "",
    phone: "",
  });

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || !messageId) return;

    let cancelled = false;
    setLoading(true);
    fetch(`/api/inbox/sms/messages/${messageId}/contact-info`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to parse contact info");
        }
        if (cancelled) return;
        const parsed = data.parsed as ParsedSmsContactInfo;
        setFallbackPhone(data.fallbackPhone ?? null);
        setTargetCustomer((data.customer as TargetCustomer | null) ?? null);
        setFieldActions(EMPTY_ACTIONS);
        setForm({
          firstName: parsed.firstName ?? "",
          lastName: parsed.lastName ?? "",
          homeAddress: parsed.homeAddress ?? "",
          email: parsed.email ?? "",
          phone: parsed.phone ?? data.fallbackPhone ?? "",
        });
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : "Failed to load contact info");
        onCloseRef.current();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, messageId]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const detectedName = [form.firstName, form.lastName].filter(Boolean).join(" ").trim();
    const phoneAlreadySaved = Boolean(
      form.phone &&
        (samePhone(targetCustomer?.phone, form.phone) ||
          targetCustomer?.phones.some((entry) => samePhone(entry.phone, form.phone)))
    );
    const emailAlreadySaved = Boolean(
      form.email &&
        (sameText(targetCustomer?.email, form.email) ||
          targetCustomer?.emails.some((entry) => sameText(entry.email, form.email)))
    );
    const conflicts = targetCustomer
      ? {
          name: Boolean(detectedName && !sameText(targetCustomer.name, detectedName)),
          phone: Boolean(form.phone && targetCustomer.phone && !phoneAlreadySaved),
          email: Boolean(form.email && targetCustomer.email && !emailAlreadySaved),
          address: Boolean(
            form.homeAddress &&
              targetCustomer.address &&
              !sameText(targetCustomer.address, form.homeAddress)
          ),
        }
      : { name: false, phone: false, email: false, address: false };
    const unresolved = Object.entries(conflicts)
      .filter(([, conflict]) => conflict)
      .map(([field]) => field as keyof FieldActions)
      .filter((field) => !fieldActions[field]);
    if (unresolved.length) {
      toast.error(`Choose how to save the existing ${unresolved.join(", ")} field${unresolved.length === 1 ? "" : "s"}.`);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/inbox/sms/messages/${messageId}/contact-info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, fieldActions }),
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

  const detectedName = [form.firstName, form.lastName].filter(Boolean).join(" ").trim();
  const phoneAlreadySaved = Boolean(
    form.phone &&
      (samePhone(targetCustomer?.phone, form.phone) ||
        targetCustomer?.phones.some((entry) => samePhone(entry.phone, form.phone)))
  );
  const emailAlreadySaved = Boolean(
    form.email &&
      (sameText(targetCustomer?.email, form.email) ||
        targetCustomer?.emails.some((entry) => sameText(entry.email, form.email)))
  );
  const conflicts = targetCustomer
    ? {
        name: Boolean(detectedName && !sameText(targetCustomer.name, detectedName)),
        phone: Boolean(form.phone && targetCustomer.phone && !phoneAlreadySaved),
        email: Boolean(form.email && targetCustomer.email && !emailAlreadySaved),
        address: Boolean(
          form.homeAddress &&
            targetCustomer.address &&
            !sameText(targetCustomer.address, form.homeAddress)
        ),
      }
    : { name: false, phone: false, email: false, address: false };

  function ConflictChoice({
    field,
    existing,
    allowSecondary = false,
    secondaryLabel = "Add as secondary",
  }: {
    field: keyof FieldActions;
    existing: string;
    allowSecondary?: boolean;
    secondaryLabel?: string;
  }) {
    if (!conflicts[field]) return null;
    return (
      <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950">
        <p className="mb-1.5">
          Current: <span className="font-medium">{existing}</span>
        </p>
        <select
          className="h-8 w-full rounded-md border border-amber-300 bg-background px-2 text-xs text-foreground"
          value={fieldActions[field]}
          onChange={(event) =>
            setFieldActions((current) => ({
              ...current,
              [field]: event.target.value as FieldAction,
            }))
          }
          aria-label={`How to save ${field}`}
          required
        >
          <option value="">Choose how to save...</option>
          <option value="keep">Keep current</option>
          {allowSecondary ? <option value="secondary">{secondaryLabel}</option> : null}
          <option value="replace">Replace primary</option>
        </select>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-lg border bg-background shadow-lg">
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

              <div className="rounded-md border bg-muted/30 p-3 text-xs">
                {targetCustomer ? (
                  <p>
                    Saving to <span className="font-semibold">{targetCustomer.name}</span>. Existing
                    information will only be replaced when you explicitly choose that option.
                  </p>
                ) : (
                  <p>No matching customer was found, so saving will create a new contact.</p>
                )}
              </div>

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
              {targetCustomer ? (
                <ConflictChoice field="name" existing={targetCustomer.name} />
              ) : null}

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
                {targetCustomer?.address ? (
                  <ConflictChoice
                    field="address"
                    existing={targetCustomer.address}
                    allowSecondary
                    secondaryLabel="Add as another property"
                  />
                ) : null}
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
                {targetCustomer?.email ? (
                  <ConflictChoice field="email" existing={targetCustomer.email} allowSecondary />
                ) : null}
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
                {targetCustomer?.phone ? (
                  <ConflictChoice
                    field="phone"
                    existing={formatPhoneDisplay(targetCustomer.phone)}
                    allowSecondary
                  />
                ) : null}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving
                    ? "Saving..."
                    : targetCustomer
                      ? `Save to ${targetCustomer.name}`
                      : "Create contact"}
                </Button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
