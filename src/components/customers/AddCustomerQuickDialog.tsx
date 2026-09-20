"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Phone, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressFields, type AddressFieldValue } from "@/components/customers/AddressFields";
import { useVoiceDeviceOptional } from "@/contexts/VoiceDeviceProvider";
import type { CustomerDTO } from "@/lib/customers/types";
import { formatPhoneDisplay } from "@/lib/inbox/phone";

const EMPTY_ADDRESS: AddressFieldValue = {
  address: "",
  city: "",
  state: "",
  zip: "",
};

type Prefill = {
  firstName?: string;
  lastName?: string;
  phone?: string;
};

type Props = {
  open: boolean;
  prefill?: Prefill;
  onClose: () => void;
  onCreated: (customer: CustomerDTO) => void;
};

function splitName(name: string | null | undefined): { firstName: string; lastName: string } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function AddCustomerQuickDialog({ open, prefill, onClose, onCreated }: Props) {
  const voice = useVoiceDeviceOptional();
  const activeCall = voice?.activeCall ?? null;
  const callPhone = activeCall?.remoteNumber || activeCall?.callerInfo?.phone || "";
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState<AddressFieldValue>(EMPTY_ADDRESS);

  useEffect(() => {
    if (!open) return;
    setFirstName(prefill?.firstName ?? "");
    setLastName(prefill?.lastName ?? "");
    setEmail("");
    setPhone(prefill?.phone ?? "");
    setAddress(EMPTY_ADDRESS);
  }, [open, prefill?.firstName, prefill?.lastName, prefill?.phone]);

  if (!open || typeof document === "undefined") return null;

  function fillFromCall() {
    if (!callPhone) return;
    setPhone(formatPhoneDisplay(callPhone));
    if (!firstName && !lastName) {
      const fromCall = splitName(activeCall?.callerInfo?.name);
      if (fromCall.firstName) setFirstName(fromCall.firstName);
      if (fromCall.lastName) setLastName(fromCall.lastName);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const name = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("First and last name are required");
      return;
    }
    if (!address.address.trim()) {
      toast.error("Address is required");
      return;
    }
    if (!email.trim() && !phone.trim()) {
      toast.error("Enter a phone number or email address");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          address: address.address.trim(),
          city: address.city.trim() || undefined,
          state: address.state.trim() || undefined,
          zip: address.zip.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to create customer");
        return;
      }
      toast.success("Customer added");
      onCreated(data as CustomerDTO);
      onClose();
    } catch {
      toast.error("Failed to create customer");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-lg border bg-background shadow-lg">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Add customer</h2>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form className="min-h-0 flex-1 overflow-y-auto p-4" onSubmit={(e) => void handleSubmit(e)}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">First name</label>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Last name</label>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                required
              />
            </div>

            <AddressFields value={address} onChange={setAddress} />

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Phone</label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
              />
              {callPhone ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={fillFromCall}
                >
                  <Phone className="h-3.5 w-3.5" />
                  + Add from this call
                  <span className="text-muted-foreground">({formatPhoneDisplay(callPhone)})</span>
                </Button>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">
                Enter at least a phone number or email address.
              </p>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Adding…" : "Add customer"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export function prefillFromSearchQuery(query: string): Prefill {
  const q = query.trim();
  if (!q) return {};
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 7) return { phone: q };
  const parts = q.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}
