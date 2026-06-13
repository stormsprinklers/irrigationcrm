"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { BILLING_FREQUENCY_LABELS, formatCurrency } from "@/lib/maintenance-plans/format";
import type { CustomerPropertyDTO } from "@/lib/customers/types";
import type { MaintenancePlanTemplateDTO } from "@/lib/maintenance-plans/types";
import type { BillingFrequency } from "@prisma/client";

type Props = {
  customerId: string;
  properties: CustomerPropertyDTO[];
  open: boolean;
  onClose: () => void;
  onEnrolled: () => void;
};

export function EnrollPlanModal({ customerId, properties, open, onClose, onEnrolled }: Props) {
  const [templates, setTemplates] = useState<MaintenancePlanTemplateDTO[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [billingFrequency, setBillingFrequency] = useState<BillingFrequency>("ANNUAL");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [autoRenew, setAutoRenew] = useState(true);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const selectedTemplate = templates.find((t) => t.id === templateId);

  const loadTemplates = useCallback(async () => {
    const res = await fetch("/api/maintenance-plans/templates");
    if (res.ok) {
      const data = await res.json();
      setTemplates((data.templates ?? []).filter((t: MaintenancePlanTemplateDTO) => t.active));
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadTemplates().catch(() => toast.error("Failed to load templates"));
      if (properties.length > 0 && !propertyId) {
        setPropertyId(properties.find((p) => p.isPrimary)?.id ?? properties[0].id);
      }
    }
  }, [open, loadTemplates, properties, propertyId]);

  useEffect(() => {
    if (selectedTemplate) {
      setBillingFrequency(selectedTemplate.allowedBillingFrequencies[0] ?? "ANNUAL");
      setAutoRenew(selectedTemplate.autoRenewDefault);
      setSelectedAddonIds([]);
    }
  }, [selectedTemplate]);

  if (!open) return null;

  function toggleAddon(id: string) {
    setSelectedAddonIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!propertyId || !templateId) {
      toast.error("Select a property and template");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/maintenance-plans/enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          propertyId,
          templateId,
          billingFrequency,
          startDate,
          autoRenew,
          selectedAddonIds,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Failed to enroll customer");
        return;
      }
      const enrollment = await res.json();
      toast.success("Enrollment created");
      onEnrolled();
      onClose();
      window.location.href = `/maintenance-plans/enrollments/${enrollment.id}`;
    } catch {
      toast.error("Failed to enroll customer");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg border bg-background p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold">Enroll in maintenance plan</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Property</label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              required
            >
              <option value="">Select property</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Plan template</label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              required
            >
              <option value="">Select template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {formatCurrency(t.basePrice)}/yr
                </option>
              ))}
            </select>
          </div>

          {selectedTemplate && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium">Billing frequency</label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={billingFrequency}
                  onChange={(e) => setBillingFrequency(e.target.value as BillingFrequency)}
                >
                  {selectedTemplate.allowedBillingFrequencies.map((freq) => (
                    <option key={freq} value={freq}>
                      {BILLING_FREQUENCY_LABELS[freq]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Start date</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={autoRenew} onCheckedChange={(c) => setAutoRenew(Boolean(c))} />
                Auto-renew
              </label>

              {selectedTemplate.addons.length > 0 && (
                <div>
                  <label className="mb-2 block text-sm font-medium">Add-ons</label>
                  <div className="space-y-2">
                    {selectedTemplate.addons
                      .filter((a) => a.active)
                      .map((addon) => (
                        <label key={addon.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={selectedAddonIds.includes(addon.id)}
                            onCheckedChange={() => toggleAddon(addon.id)}
                          />
                          {addon.name} (+{formatCurrency(addon.price)})
                        </label>
                      ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Enrolling..." : "Enroll"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
