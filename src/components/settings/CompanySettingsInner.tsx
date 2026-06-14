"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_BUSINESS_HOURS, type BusinessHoursDay, type CompanySettingsDTO } from "@/lib/company/types";
import { cn } from "@/lib/utils";

const profileTabs = ["Profile", "Business hours"] as const;

const profileFields: { key: keyof CompanySettingsDTO; label: string }[] = [
  { key: "name", label: "Business name" },
  { key: "legalName", label: "Legal entity name" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "Zip" },
  { key: "timezone", label: "Time zone" },
  { key: "supportEmail", label: "Support email" },
  { key: "phone", label: "Business phone" },
  { key: "website", label: "Website" },
  { key: "industry", label: "Industry" },
];

const dayKeys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

export function CompanySettingsInner() {
  const [tab, setTab] = useState<(typeof profileTabs)[number]>("Profile");
  const [company, setCompany] = useState<CompanySettingsDTO | null>(null);
  const [hours, setHours] = useState<Record<string, BusinessHoursDay>>(DEFAULT_BUSINESS_HOURS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/company")
      .then((r) => r.json())
      .then((data) => {
        setCompany(data);
        if (data.businessHours && typeof data.businessHours === "object") {
          setHours({ ...DEFAULT_BUSINESS_HOURS, ...(data.businessHours as Record<string, BusinessHoursDay>) });
        }
      })
      .catch(() => toast.error("Failed to load company settings"));
  }, []);

  async function save() {
    if (!company) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...company, businessHours: hours }),
      });
      if (!res.ok) throw new Error("Save failed");
      setCompany(await res.json());
      toast.success("Company settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (!company) {
    return (
      <ContentArea className="max-w-4xl">
        <PageHeader title="Company" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </ContentArea>
    );
  }

  return (
    <ContentArea className="max-w-4xl">
      <PageHeader title="Company" actions={<Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>} />

      <div className="mb-6 flex gap-6 border-b border-border">
        {profileTabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "relative pb-3 text-sm font-medium transition-colors",
              tab === t
                ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Profile" ? (
        <div className="space-y-6">
          <section className="rounded-lg border border-border bg-white p-6">
            <h3 className="mb-4 text-lg font-semibold">Business Information</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {profileFields.map(({ key, label }) => (
                <div key={key}>
                  <label className="text-sm text-muted-foreground">{label}</label>
                  <Input
                    className="mt-1"
                    value={(company[key] as string) ?? ""}
                    onChange={(e) => setCompany({ ...company, [key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-lg border border-border bg-white p-6">
            <h3 className="mb-4 text-lg font-semibold">Company Description</h3>
            <textarea
              rows={4}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={company.description ?? ""}
              onChange={(e) => setCompany({ ...company, description: e.target.value })}
            />
          </section>
        </div>
      ) : (
        <section className="rounded-lg border border-border bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold">Business Hours</h3>
          <div className="space-y-3">
            {dayKeys.map((day) => {
              const slot = hours[day] ?? DEFAULT_BUSINESS_HOURS[day];
              return (
                <div key={day} className="flex flex-wrap items-center gap-3">
                  <span className="w-28 capitalize text-sm font-medium">{day}</span>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={slot.open}
                      onChange={(e) =>
                        setHours({ ...hours, [day]: { ...slot, open: e.target.checked } })
                      }
                    />
                    Open
                  </label>
                  <Input
                    type="time"
                    className="w-32"
                    value={slot.start}
                    disabled={!slot.open}
                    onChange={(e) => setHours({ ...hours, [day]: { ...slot, start: e.target.value } })}
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    type="time"
                    className="w-32"
                    value={slot.end}
                    disabled={!slot.open}
                    onChange={(e) => setHours({ ...hours, [day]: { ...slot, end: e.target.value } })}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}
    </ContentArea>
  );
}
