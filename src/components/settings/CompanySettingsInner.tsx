"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { useCompanyBrand } from "@/components/layout/CompanyBrandProvider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_BRAND_PALETTE,
  resolveBrandPalette,
  sanitizeBrandPalette,
  type BrandPalette,
} from "@/lib/brand-palette";
import { DEFAULT_BUSINESS_HOURS, type BusinessHoursDay, type CompanySettingsDTO } from "@/lib/company/types";
import { absolutePublicBlobUrl, blobProxyUrl, isBlobStorageUrl } from "@/lib/blob/urls";
import { stormBrand } from "@/lib/branding";
import { bimiDnsHost, buildBimiTxtRecord, domainFromSendgridFrom } from "@/lib/inbox/bimi";
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

function hexPickerValue(value: string | null | undefined, fallback: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value ?? "") ? (value as string) : fallback;
}

function BrandColorField({
  label,
  hint,
  value,
  fallback,
  onChange,
  onClear,
}: {
  label: string;
  hint: string;
  value: string | null;
  fallback: string;
  onChange: (hex: string) => void;
  onClear?: () => void;
}) {
  return (
    <div>
      <label className="text-sm text-muted-foreground">{label}</label>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          className="h-10 w-12 cursor-pointer rounded border border-input bg-background"
          value={hexPickerValue(value, fallback)}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
        <Input
          value={value ?? ""}
          placeholder={fallback}
          onChange={(e) => onChange(e.target.value)}
        />
        {onClear ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function CompanySettingsInner() {
  const { refresh: refreshBrand } = useCompanyBrand();
  const [tab, setTab] = useState<(typeof profileTabs)[number]>("Profile");
  const [company, setCompany] = useState<CompanySettingsDTO | null>(null);
  const [activeMaintenanceEnrollmentCount, setActiveMaintenanceEnrollmentCount] = useState(0);
  const [hours, setHours] = useState<Record<string, BusinessHoursDay>>(DEFAULT_BUSINESS_HOURS);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBrandLogo, setUploadingBrandLogo] = useState(false);
  const [uploadingBimiLogo, setUploadingBimiLogo] = useState(false);
  const [uploadingBimiCert, setUploadingBimiCert] = useState(false);
  const [copiedBimiField, setCopiedBimiField] = useState<"host" | "txt" | null>(null);
  const [pendingFeatureToggle, setPendingFeatureToggle] = useState<{
    key:
      | "irrigationFeaturesEnabled"
      | "holidayLightingFeaturesEnabled"
      | "maintenancePlansFeaturesEnabled";
    next: boolean;
    title: string;
    description: string;
  } | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const brandLogoInputRef = useRef<HTMLInputElement>(null);
  const bimiLogoInputRef = useRef<HTMLInputElement>(null);
  const bimiCertInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/settings/company")
      .then((r) => r.json())
      .then((data) => {
        setCompany(data);
        setActiveMaintenanceEnrollmentCount(
          typeof data.activeMaintenanceEnrollmentCount === "number"
            ? data.activeMaintenanceEnrollmentCount
            : 0
        );
        if (data.businessHours && typeof data.businessHours === "object") {
          setHours({ ...DEFAULT_BUSINESS_HOURS, ...(data.businessHours as Record<string, BusinessHoursDay>) });
        }
      })
      .catch(() => toast.error("Failed to load company settings"));
  }, []);

  function updatePalette(patch: Partial<BrandPalette>) {
    if (!company) return;
    const current = {
      ...resolveBrandPalette(company),
      ...(company.brandPalette && typeof company.brandPalette === "object"
        ? (company.brandPalette as Partial<BrandPalette>)
        : {}),
    };
    const next: BrandPalette = {
      primary: patch.primary ?? current.primary,
      secondary: patch.secondary ?? current.secondary,
      soft: patch.soft ?? current.soft,
      panel: patch.panel ?? current.panel,
      accent: patch.accent !== undefined ? patch.accent : current.accent,
      extras: patch.extras ?? current.extras,
    };
    setCompany({
      ...company,
      brandPrimaryColor: next.primary,
      brandSecondaryColor: next.secondary,
      brandPalette: next,
    });
  }

  async function save() {
    if (!company) return;
    setSaving(true);
    try {
      const palette = sanitizeBrandPalette(resolveBrandPalette(company));
      const payload = {
        ...company,
        businessHours: hours,
        brandPrimaryColor: palette.primary,
        brandSecondaryColor: palette.secondary,
        brandPalette: palette,
      };
      const res = await fetch("/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Save failed"
        );
      }
      if (typeof data.activeMaintenanceEnrollmentCount === "number") {
        setActiveMaintenanceEnrollmentCount(data.activeMaintenanceEnrollmentCount);
      }
      setCompany(data);
      await refreshBrand();
      toast.success("Company settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  function requestFeatureToggle(
    key:
      | "irrigationFeaturesEnabled"
      | "holidayLightingFeaturesEnabled"
      | "maintenancePlansFeaturesEnabled",
    next: boolean,
    title: string,
    description: string
  ) {
    if (
      key === "maintenancePlansFeaturesEnabled" &&
      next === false &&
      activeMaintenanceEnrollmentCount > 0
    ) {
      toast.error(
        `Cannot disable maintenance plans while ${activeMaintenanceEnrollmentCount} customer${
          activeMaintenanceEnrollmentCount === 1 ? " is" : "s are"
        } actively enrolled.`
      );
      return;
    }
    setPendingFeatureToggle({ key, next, title, description });
  }

  function confirmFeatureToggle() {
    if (!company || !pendingFeatureToggle) return;
    setCompany({
      ...company,
      [pendingFeatureToggle.key]: pendingFeatureToggle.next,
    });
    setPendingFeatureToggle(null);
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

  async function uploadBimiLogo(file: File) {
    setUploadingBimiLogo(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/settings/company/bimi-logo", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setCompany(data.company);
      toast.success("BIMI logo uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingBimiLogo(false);
      if (bimiLogoInputRef.current) bimiLogoInputRef.current.value = "";
    }
  }

  async function removeBimiLogo() {
    setUploadingBimiLogo(true);
    try {
      const res = await fetch("/api/settings/company/bimi-logo", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Remove failed");
      setCompany(data.company);
      toast.success("BIMI logo removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setUploadingBimiLogo(false);
    }
  }

  async function uploadBimiCertificate(file: File) {
    setUploadingBimiCert(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/settings/company/bimi-certificate", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setCompany(data.company);
      toast.success("BIMI certificate uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingBimiCert(false);
      if (bimiCertInputRef.current) bimiCertInputRef.current.value = "";
    }
  }

  async function removeBimiCertificate() {
    setUploadingBimiCert(true);
    try {
      const res = await fetch("/api/settings/company/bimi-certificate", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Remove failed");
      setCompany(data.company);
      toast.success("BIMI certificate removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setUploadingBimiCert(false);
    }
  }

  async function copyText(value: string, field: "host" | "txt") {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedBimiField(field);
      toast.success("Copied to clipboard");
      window.setTimeout(() => setCopiedBimiField(null), 2000);
    } catch {
      toast.error("Could not copy");
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
            <h3 className="mb-1 text-lg font-semibold">Industry features</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Enable only the tools this company needs. Changes apply after you save.
            </p>
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Irrigation tools</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Rachio, property irrigation maps, sprinkler programming guides, parts suppliers,
                    and related portal features.
                  </p>
                </div>
                <Switch
                  checked={company.irrigationFeaturesEnabled !== false}
                  onCheckedChange={(checked) =>
                    requestFeatureToggle(
                      "irrigationFeaturesEnabled",
                      checked,
                      checked ? "Enable irrigation tools?" : "Disable irrigation tools?",
                      checked
                        ? "This will show Rachio, irrigation maps, programming, parts suppliers, and related portal features after you save."
                        : "This will hide Rachio, irrigation maps, programming, parts suppliers, and related portal features after you save."
                    )
                  }
                />
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Holiday lighting tools</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Satellite / Street View quoting, light catalog, AI lighting previews, and holiday
                    estimate builder.
                  </p>
                </div>
                <Switch
                  checked={company.holidayLightingFeaturesEnabled === true}
                  onCheckedChange={(checked) =>
                    requestFeatureToggle(
                      "holidayLightingFeaturesEnabled",
                      checked,
                      checked
                        ? "Enable holiday lighting tools?"
                        : "Disable holiday lighting tools?",
                      checked
                        ? "This will show the holiday lighting quoter and catalog after you save."
                        : "This will hide the holiday lighting quoter and catalog after you save."
                    )
                  }
                />
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Maintenance plans</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Plan templates, enrollments, recurring billing, and portal maintenance plans.
                    {activeMaintenanceEnrollmentCount > 0
                      ? ` ${activeMaintenanceEnrollmentCount} active enrollment${
                          activeMaintenanceEnrollmentCount === 1 ? "" : "s"
                        } — cannot disable until those end.`
                      : ""}
                  </p>
                </div>
                <Switch
                  checked={company.maintenancePlansFeaturesEnabled !== false}
                  disabled={
                    company.maintenancePlansFeaturesEnabled !== false &&
                    activeMaintenanceEnrollmentCount > 0
                  }
                  onCheckedChange={(checked) =>
                    requestFeatureToggle(
                      "maintenancePlansFeaturesEnabled",
                      checked,
                      checked ? "Enable maintenance plans?" : "Disable maintenance plans?",
                      checked
                        ? "This will show maintenance plan tools in the CRM and portal after you save."
                        : "This will hide maintenance plan tools after you save. You can only disable this when no customers are actively enrolled."
                    )
                  }
                />
              </div>
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

          {(() => {
            const palette = resolveBrandPalette(company);
            return (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold">Brand palette</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    These colors drive CRM chrome (buttons, cards, text) and seed the email campaign
                    builder palette.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <BrandColorField
                    label="Primary"
                    hint="Buttons, links, and active nav."
                    value={palette.primary}
                    fallback={DEFAULT_BRAND_PALETTE.primary}
                    onChange={(hex) => updatePalette({ primary: hex })}
                  />
                  <BrandColorField
                    label="Secondary"
                    hint="Main text and dark accents."
                    value={palette.secondary}
                    fallback={DEFAULT_BRAND_PALETTE.secondary}
                    onChange={(hex) => updatePalette({ secondary: hex })}
                  />
                  <BrandColorField
                    label="Soft"
                    hint="Secondary buttons and tinted home cards."
                    value={palette.soft}
                    fallback={DEFAULT_BRAND_PALETTE.soft}
                    onChange={(hex) => updatePalette({ soft: hex })}
                  />
                  <BrandColorField
                    label="Panel"
                    hint="Lighter panel backgrounds on the home screen."
                    value={palette.panel}
                    fallback={DEFAULT_BRAND_PALETTE.panel}
                    onChange={(hex) => updatePalette({ panel: hex })}
                  />
                  <BrandColorField
                    label="Accent"
                    hint="Optional accent for email CTAs and highlights."
                    value={palette.accent}
                    fallback={DEFAULT_BRAND_PALETTE.accent ?? stormBrand.coral}
                    onChange={(hex) => updatePalette({ accent: hex || null })}
                    onClear={() => updatePalette({ accent: null })}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm text-muted-foreground">Extra colors</label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        updatePalette({ extras: [...palette.extras, "#CCCCCC"] })
                      }
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add color
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Extra swatches for the email AI (backgrounds, borders, etc.).
                  </p>
                  <div className="mt-3 space-y-2">
                    {palette.extras.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No extra colors yet.</p>
                    ) : (
                      palette.extras.map((extra, idx) => (
                        <div key={`extra-${idx}`} className="flex items-center gap-2">
                          <input
                            type="color"
                            className="h-10 w-12 cursor-pointer rounded border border-input bg-background"
                            value={hexPickerValue(extra, "#CCCCCC")}
                            onChange={(e) => {
                              const next = palette.extras.map((c, i) =>
                                i === idx ? e.target.value.toUpperCase() : c
                              );
                              updatePalette({ extras: next });
                            }}
                          />
                          <Input
                            value={extra}
                            onChange={(e) => {
                              const next = palette.extras.map((c, i) =>
                                i === idx ? e.target.value : c
                              );
                              updatePalette({ extras: next });
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              updatePalette({
                                extras: palette.extras.filter((_, i) => i !== idx),
                              })
                            }
                            aria-label={`Remove extra color ${idx + 1}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <p className="text-xs font-medium text-foreground">Preview</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(
                      [
                        ["Primary", palette.primary],
                        ["Secondary", palette.secondary],
                        ["Soft", palette.soft],
                        ["Panel", palette.panel],
                        ...(palette.accent ? ([["Accent", palette.accent]] as const) : []),
                        ...palette.extras.map((c, i) => [`Extra ${i + 1}`, c] as const),
                      ] as const
                    ).map(([label, hex]) => (
                      <div key={label} className="flex items-center gap-2 text-xs">
                        <span
                          className="h-6 w-6 rounded border border-border"
                          style={{ backgroundColor: hex }}
                          title={hex}
                        />
                        <span className="text-muted-foreground">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </section>
      ) : tab === "Email branding" ? (
        <section className="rounded-lg border border-border bg-white p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold">Email branding</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Controls how outbound emails appear to customers (invoices, estimates, inbox, and campaigns).
              Brand colors are set under the Branding tab and also seed campaign AI. The from address
              itself is set under Settings → Inbox.
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
              Square images work best (at least 96×96 px). This logo appears at the top of HTML email
              bodies only — it does not set the circular avatar next to your name in Gmail, Yahoo, or
              Apple Mail. Use the Inbox avatar (BIMI) section below for that.
            </p>
          </div>

          <div className="space-y-4 border-t border-border pt-6">
            <div>
              <h4 className="text-sm font-semibold">Inbox avatar (BIMI)</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                BIMI publishes a brand logo that supporting inboxes can show next to authenticated
                mail. Upload a square SVG Tiny PS logo, optionally attach a VMC/CMC certificate, then
                add the DNS TXT record on your From domain. Gmail does not use Gravatar for inbox
                avatars.
              </p>
            </div>

            {(() => {
              const fromDomain = domainFromSendgridFrom(company.sendgridFrom);
              const dnsHost = fromDomain ? bimiDnsHost(fromDomain) : null;
              const txtRecord = buildBimiTxtRecord({
                bimiLogoUrl: company.bimiLogoUrl,
                bimiCertificateUrl: company.bimiCertificateUrl,
              });
              const publicLogoUrl = absolutePublicBlobUrl(company.bimiLogoUrl);
              const publicCertUrl = absolutePublicBlobUrl(company.bimiCertificateUrl);

              return (
                <>
                  <div>
                    <label className="text-sm text-muted-foreground">BIMI logo (SVG)</label>
                    <div className="mt-2 flex flex-wrap items-center gap-4">
                      {company.bimiLogoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={blobProxyUrl(company.bimiLogoUrl) ?? company.bimiLogoUrl}
                          alt={`${company.name} BIMI logo`}
                          className="h-14 w-14 rounded-full border border-border bg-card object-contain p-1"
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-border text-[10px] text-muted-foreground">
                          SVG
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <input
                          ref={bimiLogoInputRef}
                          type="file"
                          accept=".svg,image/svg+xml"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void uploadBimiLogo(file);
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={uploadingBimiLogo}
                          onClick={() => bimiLogoInputRef.current?.click()}
                        >
                          {uploadingBimiLogo
                            ? "Uploading..."
                            : company.bimiLogoUrl
                              ? "Replace SVG"
                              : "Upload SVG"}
                        </Button>
                        {company.bimiLogoUrl ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={uploadingBimiLogo}
                            onClick={() => void removeBimiLogo()}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Must be SVG Tiny PS (square, no scripts/external refs). BIMI Group recommends
                      ≤32KB.{" "}
                      <a
                        href="https://bimigroup.org/svg-requirements/"
                        className="text-primary underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        SVG requirements
                      </a>
                      {publicLogoUrl ? (
                        <>
                          {" "}
                          · Public URL:{" "}
                          <span className="break-all font-mono text-[11px]">{publicLogoUrl}</span>
                        </>
                      ) : null}
                    </p>
                  </div>

                  <div>
                    <label className="text-sm text-muted-foreground">
                      Certificate (optional — required for Gmail / Apple)
                    </label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input
                        ref={bimiCertInputRef}
                        type="file"
                        accept=".pem,application/x-pem-file,application/pem-certificate-chain,text/plain"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadBimiCertificate(file);
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={uploadingBimiCert}
                        onClick={() => bimiCertInputRef.current?.click()}
                      >
                        {uploadingBimiCert
                          ? "Uploading..."
                          : company.bimiCertificateUrl
                            ? "Replace PEM"
                            : "Upload PEM"}
                      </Button>
                      {company.bimiCertificateUrl ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={uploadingBimiCert}
                          onClick={() => void removeBimiCertificate()}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Upload the PEM chain from your VMC or CMC issuer, or paste an HTTPS URL below
                      and Save.{" "}
                      <a
                        href="https://www.digicert.com/tls-ssl/verified-mark-certificates"
                        className="text-primary underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        DigiCert VMC
                      </a>
                    </p>
                    <Input
                      className="mt-2 font-mono text-xs"
                      placeholder={
                        company.bimiCertificateUrl && isBlobStorageUrl(company.bimiCertificateUrl)
                          ? "PEM uploaded — paste an HTTPS URL to replace it"
                          : "https://…/certificate.pem"
                      }
                      value={
                        company.bimiCertificateUrl && isBlobStorageUrl(company.bimiCertificateUrl)
                          ? ""
                          : (company.bimiCertificateUrl ?? "")
                      }
                      onChange={(e) => {
                        const next = e.target.value.trim();
                        if (
                          !next &&
                          company.bimiCertificateUrl &&
                          isBlobStorageUrl(company.bimiCertificateUrl)
                        ) {
                          return;
                        }
                        setCompany({
                          ...company,
                          bimiCertificateUrl: next || null,
                        });
                      }}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Leave blank if you uploaded a PEM above. Pasting a URL and clicking Save replaces
                      the uploaded certificate.
                      {publicCertUrl ? (
                        <>
                          {" "}
                          Active public URL:{" "}
                          <span className="break-all font-mono text-[11px]">{publicCertUrl}</span>
                        </>
                      ) : null}
                    </p>
                  </div>

                  <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
                    <div>
                      <p className="text-xs font-medium text-foreground">From domain</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {fromDomain ? (
                          <>
                            Using <span className="font-mono text-foreground">{fromDomain}</span> from
                            your Inbox From address. Publish BIMI DNS on this domain.
                          </>
                        ) : (
                          <>
                            Set your outbound From address under{" "}
                            <a href="/settings/inbox" className="text-primary underline">
                              Settings → Inbox
                            </a>{" "}
                            so we can show the DNS host name.
                          </>
                        )}
                      </p>
                    </div>

                    {dnsHost ? (
                      <div>
                        <p className="text-xs font-medium text-foreground">DNS TXT host</p>
                        <div className="mt-1 flex items-start gap-2">
                          <code className="flex-1 break-all rounded border border-border bg-background px-2 py-1.5 text-[11px]">
                            {dnsHost}
                          </code>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void copyText(dnsHost, "host")}
                          >
                            {copiedBimiField === "host" ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    <div>
                      <p className="text-xs font-medium text-foreground">DNS TXT value</p>
                      {txtRecord ? (
                        <div className="mt-1 flex items-start gap-2">
                          <code className="flex-1 break-all rounded border border-border bg-background px-2 py-1.5 text-[11px]">
                            {txtRecord}
                          </code>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void copyText(txtRecord, "txt")}
                          >
                            {copiedBimiField === "txt" ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Upload a BIMI SVG and ensure{" "}
                          <code className="text-[11px]">NEXT_PUBLIC_APP_URL</code> is an{" "}
                          <code className="text-[11px]">https://</code> app URL so providers can fetch
                          the logo.
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="text-xs font-medium text-foreground">Setup checklist</p>
                      <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
                        <li>SPF and DKIM aligned to your From domain (SendGrid DNS).</li>
                        <li>
                          DMARC policy <code className="text-[11px]">p=quarantine</code> or{" "}
                          <code className="text-[11px]">p=reject</code> with{" "}
                          <code className="text-[11px]">pct=100</code>.
                        </li>
                        <li>Publish the BIMI TXT record above at your DNS host.</li>
                        <li>
                          Gmail needs a VMC or CMC; Apple Mail needs a DigiCert VMC. Yahoo often shows
                          the logo without a certificate.
                        </li>
                        <li>
                          Outlook / Microsoft 365 do not display BIMI logos today. Recipients who save
                          you as a contact may still see their contact photo.
                        </li>
                      </ol>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Validate with the{" "}
                        <a
                          href="https://bimigroup.org/bimi-generator/"
                          className="text-primary underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          BIMI Group generator
                        </a>
                        .
                      </p>
                    </div>
                  </div>
                </>
              );
            })()}
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
      <ConfirmDialog
        open={Boolean(pendingFeatureToggle)}
        title={pendingFeatureToggle?.title ?? ""}
        description={pendingFeatureToggle?.description ?? ""}
        confirmLabel={pendingFeatureToggle?.next ? "Enable" : "Disable"}
        confirmVariant={pendingFeatureToggle?.next ? "default" : "destructive"}
        onConfirm={confirmFeatureToggle}
        onCancel={() => setPendingFeatureToggle(null)}
      />
    </ContentArea>
  );
}
