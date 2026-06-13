"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { BILLING_FREQUENCY_LABELS, formatCurrency } from "@/lib/maintenance-plans/format";
import { SEASON_PRESETS } from "@/lib/maintenance-plans/visits";
import type { MaintenancePlanTemplateDTO } from "@/lib/maintenance-plans/types";
import type {
  BillingFrequency,
  CancellationFeeType,
  PlanDiscountAppliesTo,
  PlanDurationType,
} from "@prisma/client";

const STEPS = ["Basics", "Visits", "Pricing", "Discounts", "Add-ons", "Cancellation", "Review"] as const;

type VisitDraft = {
  name: string;
  season: string;
  defaultMonth: number;
  visitTitle: string;
  description: string;
  estimatedMinutes: number;
  enabled: boolean;
};

type DiscountDraft = {
  label: string;
  type: "PERCENT" | "FIXED";
  amount: string;
  appliesTo: PlanDiscountAppliesTo;
};

type AddonDraft = {
  name: string;
  description: string;
  price: string;
  active: boolean;
};

type Props = {
  templateId?: string;
  initial?: MaintenancePlanTemplateDTO;
};

const ALL_FREQUENCIES: BillingFrequency[] = ["MONTHLY", "QUARTERLY", "ANNUAL", "MULTI_YEAR_UPFRONT"];

function defaultVisits(): VisitDraft[] {
  return SEASON_PRESETS.map((preset) => ({
    name: preset.name,
    season: preset.season,
    defaultMonth: preset.defaultMonth,
    visitTitle: preset.visitTitle,
    description: "",
    estimatedMinutes: 60,
    enabled: true,
  }));
}

function visitsFromTemplate(template: MaintenancePlanTemplateDTO): VisitDraft[] {
  if (template.visitTemplates.length === 0) return defaultVisits();
  return template.visitTemplates.map((vt) => ({
    name: vt.name,
    season: vt.season,
    defaultMonth: vt.defaultMonth,
    visitTitle: vt.visitTitle,
    description: vt.description ?? "",
    estimatedMinutes: vt.estimatedMinutes,
    enabled: true,
  }));
}

export function TemplateWizard({ templateId, initial }: Props) {
  const router = useRouter();
  const isEdit = Boolean(templateId);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [durationType, setDurationType] = useState<PlanDurationType>(
    initial?.durationType ?? "FIXED_TERM"
  );
  const [durationYears, setDurationYears] = useState(String(initial?.durationYears ?? 1));
  const [autoRenewDefault, setAutoRenewDefault] = useState(initial?.autoRenewDefault ?? true);
  const [active, setActive] = useState(initial?.active ?? true);
  const [allowedFrequencies, setAllowedFrequencies] = useState<BillingFrequency[]>(
    initial?.allowedBillingFrequencies ?? ["ANNUAL"]
  );
  const [visits, setVisits] = useState<VisitDraft[]>(
    initial ? visitsFromTemplate(initial) : defaultVisits()
  );
  const [basePrice, setBasePrice] = useState(String(initial?.basePrice ?? ""));
  const [benefits, setBenefits] = useState((initial?.benefits ?? []).join("\n"));
  const [discounts, setDiscounts] = useState<DiscountDraft[]>(
    initial?.discounts.map((d) => ({
      label: d.label ?? "",
      type: d.type,
      amount: String(d.amount),
      appliesTo: d.appliesTo,
    })) ?? []
  );
  const [addons, setAddons] = useState<AddonDraft[]>(
    initial?.addons.map((a) => ({
      name: a.name,
      description: a.description ?? "",
      price: String(a.price),
      active: a.active,
    })) ?? []
  );
  const [cancellationFeeType, setCancellationFeeType] = useState<CancellationFeeType>(
    initial?.cancellationFeeType ?? "NONE"
  );
  const [cancellationFeeAmount, setCancellationFeeAmount] = useState(
    String(initial?.cancellationFeeAmount ?? "")
  );
  const [cancellationNoticeDays, setCancellationNoticeDays] = useState(
    String(initial?.cancellationNoticeDays ?? 0)
  );

  function toggleFrequency(freq: BillingFrequency) {
    setAllowedFrequencies((prev) =>
      prev.includes(freq) ? prev.filter((f) => f !== freq) : [...prev, freq]
    );
  }

  function updateVisit(index: number, patch: Partial<VisitDraft>) {
    setVisits((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }

  function addDiscount() {
    setDiscounts((prev) => [
      ...prev,
      { label: "", type: "PERCENT", amount: "", appliesTo: "ALL_JOBS" },
    ]);
  }

  function addAddon() {
    setAddons((prev) => [...prev, { name: "", description: "", price: "", active: true }]);
  }

  async function submit() {
    if (!name.trim()) {
      toast.error("Template name is required");
      setStep(0);
      return;
    }
    if (!basePrice || Number.isNaN(Number(basePrice))) {
      toast.error("Valid base price is required");
      setStep(2);
      return;
    }
    if (allowedFrequencies.length === 0) {
      toast.error("Select at least one billing frequency");
      setStep(0);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        basePrice: Number(basePrice),
        active,
        durationType,
        durationYears: durationType === "FIXED_TERM" ? Number(durationYears) || 1 : null,
        allowedBillingFrequencies: allowedFrequencies,
        autoRenewDefault,
        cancellationFeeType,
        cancellationFeeAmount:
          cancellationFeeType !== "NONE" && cancellationFeeAmount
            ? Number(cancellationFeeAmount)
            : null,
        cancellationNoticeDays: Number(cancellationNoticeDays) || 0,
        benefits: benefits
          .split("\n")
          .map((b) => b.trim())
          .filter(Boolean),
        visitTemplates: visits
          .filter((v) => v.enabled)
          .map((v, index) => ({
            name: v.name,
            season: v.season,
            defaultMonth: v.defaultMonth,
            visitTitle: v.visitTitle,
            description: v.description || null,
            estimatedMinutes: v.estimatedMinutes,
            sortOrder: index,
          })),
      };

      let id = templateId;

      if (isEdit && templateId) {
        const res = await fetch(`/api/maintenance-plans/templates/${templateId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          toast.error("Failed to update template");
          return;
        }
      } else {
        const res = await fetch("/api/maintenance-plans/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          toast.error("Failed to create template");
          return;
        }
        const created = await res.json();
        id = created.id;

        const existingDiscountCount = 0;
        const newDiscounts = discounts.slice(existingDiscountCount);
        for (const d of newDiscounts) {
          if (!d.amount) continue;
          await fetch(`/api/maintenance-plans/templates/${id}/discounts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              label: d.label || null,
              type: d.type,
              amount: Number(d.amount),
              appliesTo: d.appliesTo,
            }),
          });
        }

        const existingAddonCount = 0;
        const newAddons = addons.slice(existingAddonCount);
        for (const a of newAddons) {
          if (!a.name || !a.price) continue;
          await fetch(`/api/maintenance-plans/templates/${id}/addons`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: a.name,
              description: a.description || null,
              price: Number(a.price),
              active: a.active,
            }),
          });
        }
      }

      toast.success(isEdit ? "Template updated" : "Template created");
      router.push(`/maintenance-plans/templates/${id}`);
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(i)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              i === step
                ? "bg-primary text-primary-foreground"
                : i < step
                  ? "bg-muted text-foreground"
                  : "bg-muted/50 text-muted-foreground"
            }`}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{STEPS[step]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium">Plan name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Annual maintenance" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Description</label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Duration</label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={durationType}
                  onChange={(e) => setDurationType(e.target.value as PlanDurationType)}
                >
                  <option value="FIXED_TERM">Fixed term</option>
                  <option value="UNTIL_CANCELLED">Until cancelled</option>
                </select>
              </div>
              {durationType === "FIXED_TERM" && (
                <div>
                  <label className="mb-1 block text-sm font-medium">Duration (years)</label>
                  <Input
                    type="number"
                    min={1}
                    value={durationYears}
                    onChange={(e) => setDurationYears(e.target.value)}
                  />
                </div>
              )}
              <div>
                <label className="mb-2 block text-sm font-medium">Billing frequencies</label>
                <div className="space-y-2">
                  {ALL_FREQUENCIES.map((freq) => (
                    <label key={freq} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={allowedFrequencies.includes(freq)}
                        onCheckedChange={() => toggleFrequency(freq)}
                      />
                      {BILLING_FREQUENCY_LABELS[freq]}
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={autoRenewDefault} onCheckedChange={(c) => setAutoRenewDefault(Boolean(c))} />
                Auto-renew by default
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={active} onCheckedChange={(c) => setActive(Boolean(c))} />
                Active
              </label>
            </>
          )}

          {step === 1 && (
            <div className="space-y-4">
              {visits.map((visit, index) => (
                <div key={index} className="rounded-md border p-4 space-y-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={visit.enabled}
                      onCheckedChange={(c) => updateVisit(index, { enabled: Boolean(c) })}
                    />
                    {visit.name}
                  </label>
                  {visit.enabled && (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Visit title</label>
                          <Input
                            value={visit.visitTitle}
                            onChange={(e) => updateVisit(index, { visitTitle: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Default month</label>
                          <Input
                            type="number"
                            min={1}
                            max={12}
                            value={visit.defaultMonth}
                            onChange={(e) =>
                              updateVisit(index, { defaultMonth: Number(e.target.value) })
                            }
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Estimated minutes</label>
                        <Input
                          type="number"
                          min={15}
                          value={visit.estimatedMinutes}
                          onChange={(e) =>
                            updateVisit(index, { estimatedMinutes: Number(e.target.value) })
                          }
                        />
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {step === 2 && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium">Annual base price (USD)</label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Benefits (one per line)</label>
                <textarea
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  value={benefits}
                  onChange={(e) => setBenefits(e.target.value)}
                  placeholder="Priority scheduling&#10;10% off repairs"
                />
              </div>
            </>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {discounts.map((d, index) => (
                <div key={index} className="grid gap-3 rounded-md border p-3 sm:grid-cols-4">
                  <Input
                    placeholder="Label"
                    value={d.label}
                    onChange={(e) =>
                      setDiscounts((prev) =>
                        prev.map((x, i) => (i === index ? { ...x, label: e.target.value } : x))
                      )
                    }
                  />
                  <select
                    className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    value={d.type}
                    onChange={(e) =>
                      setDiscounts((prev) =>
                        prev.map((x, i) =>
                          i === index ? { ...x, type: e.target.value as "PERCENT" | "FIXED" } : x
                        )
                      )
                    }
                  >
                    <option value="PERCENT">Percent</option>
                    <option value="FIXED">Fixed</option>
                  </select>
                  <Input
                    type="number"
                    placeholder="Amount"
                    value={d.amount}
                    onChange={(e) =>
                      setDiscounts((prev) =>
                        prev.map((x, i) => (i === index ? { ...x, amount: e.target.value } : x))
                      )
                    }
                  />
                  <select
                    className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    value={d.appliesTo}
                    onChange={(e) =>
                      setDiscounts((prev) =>
                        prev.map((x, i) =>
                          i === index
                            ? { ...x, appliesTo: e.target.value as PlanDiscountAppliesTo }
                            : x
                        )
                      )
                    }
                  >
                    <option value="ALL_JOBS">All jobs</option>
                    <option value="PLAN_PRICE">Plan price</option>
                    <option value="VISIT_LABOR">Visit labor</option>
                  </select>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={addDiscount}>
                Add discount
              </Button>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              {addons.map((a, index) => (
                <div key={index} className="grid gap-3 rounded-md border p-3 sm:grid-cols-3">
                  <Input
                    placeholder="Add-on name"
                    value={a.name}
                    onChange={(e) =>
                      setAddons((prev) =>
                        prev.map((x, i) => (i === index ? { ...x, name: e.target.value } : x))
                      )
                    }
                  />
                  <Input
                    placeholder="Description"
                    value={a.description}
                    onChange={(e) =>
                      setAddons((prev) =>
                        prev.map((x, i) => (i === index ? { ...x, description: e.target.value } : x))
                      )
                    }
                  />
                  <Input
                    type="number"
                    placeholder="Price"
                    value={a.price}
                    onChange={(e) =>
                      setAddons((prev) =>
                        prev.map((x, i) => (i === index ? { ...x, price: e.target.value } : x))
                      )
                    }
                  />
                </div>
              ))}
              <Button type="button" variant="outline" onClick={addAddon}>
                Add add-on
              </Button>
            </div>
          )}

          {step === 5 && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium">Cancellation fee type</label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={cancellationFeeType}
                  onChange={(e) => setCancellationFeeType(e.target.value as CancellationFeeType)}
                >
                  <option value="NONE">None</option>
                  <option value="FIXED">Fixed amount</option>
                  <option value="PERCENT">Percent of plan price</option>
                </select>
              </div>
              {cancellationFeeType !== "NONE" && (
                <div>
                  <label className="mb-1 block text-sm font-medium">Fee amount</label>
                  <Input
                    type="number"
                    min={0}
                    value={cancellationFeeAmount}
                    onChange={(e) => setCancellationFeeAmount(e.target.value)}
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium">Notice period (days)</label>
                <Input
                  type="number"
                  min={0}
                  value={cancellationNoticeDays}
                  onChange={(e) => setCancellationNoticeDays(e.target.value)}
                />
              </div>
            </>
          )}

          {step === 6 && (
            <div className="space-y-3 text-sm">
              <p>
                <span className="font-medium">Name:</span> {name}
              </p>
              <p>
                <span className="font-medium">Price:</span>{" "}
                {basePrice ? formatCurrency(Number(basePrice)) : "—"} / year
              </p>
              <p>
                <span className="font-medium">Visits:</span>{" "}
                {visits.filter((v) => v.enabled).map((v) => v.name).join(", ") || "None"}
              </p>
              <p>
                <span className="font-medium">Discounts:</span> {discounts.length}
              </p>
              <p>
                <span className="font-medium">Add-ons:</span> {addons.length}
              </p>
              <p>
                <span className="font-medium">Billing:</span>{" "}
                {allowedFrequencies.map((f) => BILLING_FREQUENCY_LABELS[f]).join(", ")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={() => setStep((s) => s + 1)}>
            Next
          </Button>
        ) : (
          <Button type="button" disabled={saving} onClick={submit}>
            {saving ? "Saving..." : isEdit ? "Save template" : "Create template"}
          </Button>
        )}
      </div>
    </div>
  );
}
