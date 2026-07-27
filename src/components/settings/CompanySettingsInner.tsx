"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { useCompanyBrand } from "@/components/layout/CompanyBrandProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_BUSINESS_HOURS, type BusinessHoursDay, type CompanySettingsDTO } from "@/lib/company/types";
import { blobProxyUrl } from "@/lib/blob/urls";
import { stormBrand } from "@/lib/branding";
import { cn } from "@/lib/utils";

const profileTabs = ["Profile", "Branding", "Email branding", "Business hours"] as const;

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

function normalizeHexInput(value: string) {
  const raw = value.trim();
  if (!raw) return null;
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(withHash)) return value;
  return withHash.toUpperCase();
}

export function CompanySettingsInner() {
  const { refresh: refreshBrand } = useCompanyBrand();
  const [tab, setTab] = useState<(typeof profileTabs)[number]>("Profile");
  const [company, setCompany] = useState<CompanySettingsDTO | null>(null);
  const [hours, setHours] = useState<Record<string, BusinessHoursDay>>(DEFAULT_BUSINESS_HOURS);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBrandLogo, setUploadingBrandLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const brandLogoInputRef = useRef<HTMLInputElement>(null);

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
      const payload = {
        ...company,
        businessHours: hours,
        brandPrimaryColor: normalizeHexInput(company.brandPrimaryColor ?? "") || null,
        brandSecondaryColor: normalizeHexInput(company.brandSecondaryColor ?? "") || null,
      };
      const res = await fetch("/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      setCompany(await res.json());
      await refreshBrand();
      toast.success("Company settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/settings/company/email-logo", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setCompany(data.company);
      toast.success("Email logo updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  async function removeLogo() {
    setUploadingLogo(true);
    try {
      const res = await fetch("/api/settings/company/email-logo", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Remove failed");
      setCompany(data.company);
      toast.success("Email logo removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function uploadBrandLogo(file: File) {
    setUploadingBrandLogo(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/settings/company/brand-logo", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setCompany(data.company);
      await refreshBrand();
      toast.success("CRM logo updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingBrandLogo(false);
      if (brandLogoInputRef.current) brandLogoInputRef.current.value = "";
    }
  }

  async function removeBrandLogo() {
    setUploadingBrandLogo(true);
    try {
      const res = await fetch("/api/settings/company/brand-logo", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Remove failed");
      setCompany(data.company);
      await refreshBrand();
      toast.success("CRM logo removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setUploadingBrandLogo(false);
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
          <section className="rounded-lg border border-border bg-white p-6">
            <h3 className="mb-1 text-lg font-semibold">Legal links</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Used in the field app (estimate approval), receipts, and other customer-facing places.
              Paste full URLs (https://…).
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm text-muted-foreground">Terms of Service URL</label>
                <Input
                  className="mt-1"
                  type="url"
                  placeholder="https://www.stormsprinklers.com/terms"
                  value={company.termsOfServiceUrl ?? ""}
                  onChange={(e) =>
                    setCompany({ ...company, termsOfServiceUrl: e.target.value || null })
                  }
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Privacy Policy URL</label>
                <Input
                  className="mt-1"
                  type="url"
                  placeholder="https://www.stormsprinklers.com/privacy-policy"
                  value={company.privacyPolicyUrl ?? ""}
                  onChange={(e) =>
                    setCompany({ ...company, privacyPolicyUrl: e.target.value || null })
                  }
                />
              </div>
            </div>
          </section>
        </div>
      ) : tab === "Branding" ? (
        <section className="rounded-lg border border-border bg-white p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold">CRM branding</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Logo and colors for this company in the staff CRM. Switch companies to edit another
              brand&apos;s look.
            </p>
          </div>

          <div>
            <label className="text-sm text-muted-foreground">App logo (top navigation)</label>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  blobProxyUrl(company.brandLogoUrl) ||
                  blobProxyUrl(company.emailLogoUrl) ||
                  stormBrand.logoPath
                }
                alt={`${company.name} logo`}
                className="h-14 w-auto max-w-[200px] rounded-md border border-border bg-card object-contain p-1"
              />
              <div className="flex flex-wrap gap-2">
                <input
                  ref={brandLogoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadBrandLogo(file);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingBrandLogo}
                  onClick={() => brandLogoInputRef.current?.click()}
                >
                  {uploadingBrandLogo
                    ? "Uploading..."
                    : company.brandLogoUrl
                      ? "Replace logo"
                      : "Upload logo"}
                </Button>
                {company.brandLogoUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={uploadingBrandLogo}
                    onClick={() => void removeBrandLogo()}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              PNG or WebP with a transparent background works best. If empty, the email logo is used,
              then the default Storm logo.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm text-muted-foreground">Primary color</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  className="h-10 w-12 cursor-pointer rounded border border-input bg-background"
                  value={
                    /^#[0-9a-fA-F]{6}$/.test(company.brandPrimaryColor ?? "")
                      ? (company.brandPrimaryColor as string)
                      : stormBrand.sky
                  }
                  onChange={(e) =>
                    setCompany({ ...company, brandPrimaryColor: e.target.value.toUpperCase() })
                  }
                />
                <Input
                  value={company.brandPrimaryColor ?? ""}
                  placeholder={stormBrand.sky}
                  onChange={(e) =>
                    setCompany({ ...company, brandPrimaryColor: e.target.value || null })
                  }
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Buttons, active nav underline, and links (hex like {stormBrand.sky}).
              </p>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Secondary color</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  className="h-10 w-12 cursor-pointer rounded border border-input bg-background"
                  value={
                    /^#[0-9a-fA-F]{6}$/.test(company.brandSecondaryColor ?? "")
                      ? (company.brandSecondaryColor as string)
                      : stormBrand.navy
                  }
                  onChange={(e) =>
                    setCompany({ ...company, brandSecondaryColor: e.target.value.toUpperCase() })
                  }
                />
                <Input
                  value={company.brandSecondaryColor ?? ""}
                  placeholder={stormBrand.navy}
                  onChange={(e) =>
                    setCompany({ ...company, brandSecondaryColor: e.target.value || null })
                  }
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Main text / navy-style accent (hex like {stormBrand.navy}).
              </p>
            </div>
          </div>
        </section>
      ) : tab === "Email branding" ? (
        <section className="rounded-lg border border-border bg-white p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold">Email branding</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Controls how outbound emails appear to customers (invoices, estimates, inbox, and campaigns).
              The from address itself is set under Settings → Inbox.
            </p>
          </div>

          <div className="max-w-md">
            <label className="text-sm text-muted-foreground">Sender display name</label>
            <Input
              className="mt-1"
              placeholder={company.name}
              value={company.emailSenderName ?? ""}
              onChange={(e) => setCompany({ ...company, emailSenderName: e.target.value || null })}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Shown in the recipient&apos;s inbox instead of &quot;support&quot;. Leave blank to use your business name.
            </p>
          </div>

          <div>
            <label className="text-sm text-muted-foreground">Email logo</label>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              {company.emailLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={blobProxyUrl(company.emailLogoUrl) ?? company.emailLogoUrl}
                  alt={`${company.name} logo`}
                  className="h-14 w-14 rounded-xl border border-border object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
                  No logo
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadLogo(file);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingLogo}
                  onClick={() => logoInputRef.current?.click()}
                >
                  {uploadingLogo ? "Uploading..." : company.emailLogoUrl ? "Replace logo" : "Upload logo"}
                </Button>
                {company.emailLogoUrl ? (
                  <Button type="button" variant="ghost" size="sm" disabled={uploadingLogo} onClick={() => void removeLogo()}>
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Square images work best (at least 96×96 px). The logo appears at the top of HTML emails.
              For the circular avatar next to your name in Gmail, also add the same image to{" "}
              <a href="https://gravatar.com" className="text-primary underline" target="_blank" rel="noreferrer">
                Gravatar
              </a>{" "}
              using your outbound email address, or set up BIMI with your domain.
            </p>
          </div>
        </section>
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
