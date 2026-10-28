"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Loader2, Trash2, Upload } from "lucide-react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { absolutePublicBlobUrl } from "@/lib/blob/urls";

type EstimateSettings = {
  id: string;
  estimateExpiryDays: number;
  estimateDepositRequired: boolean;
  estimateDepositType: "PERCENT" | "FIXED" | null;
  estimateDepositAmount: string | number | null;
  estimateDepositThreshold: string | number;
  deferredVisitDepositThreshold: string | number;
  deferredVisitDepositPercent: string | number;
  estimateWarrantyText: string | null;
  estimateFinancingUrl: string | null;
  estimateVslEnabled: boolean;
  estimateVslVideoUrl: string | null;
  estimateVslWaitSeconds: number;
  defaultInstallDurationDays: number;
  supplierEmail: string | null;
  supplierPartsAutoSend: boolean;
};

export default function SettingsEstimatesPage() {
  const [settings, setSettings] = useState<EstimateSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/settings/estimates")
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => toast.error("Failed to load estimate settings"));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/estimates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        toast.error("Failed to save settings");
        return;
      }
      setSettings(await res.json());
      toast.success("Estimate settings saved");
    } finally {
      setSaving(false);
    }
  }

  async function uploadVslVideo(file: File) {
    if (!settings) return;
    const lowerName = file.name.toLowerCase();
    const contentType =
      file.type ||
      (lowerName.endsWith(".webm")
        ? "video/webm"
        : lowerName.endsWith(".mov")
          ? "video/quicktime"
          : lowerName.endsWith(".mp4")
            ? "video/mp4"
            : "");
    if (!["video/mp4", "video/webm", "video/quicktime"].includes(contentType)) {
      toast.error("Use an MP4, WebM, or MOV video file");
      return;
    }
    setUploadingVideo(true);
    setUploadProgress(0);
    try {
      const extension =
        contentType === "video/webm" ? "webm" : contentType === "video/quicktime" ? "mov" : "mp4";
      const blob = await upload(
        `estimate-vsl/${settings.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`,
        file,
        {
          access: "private",
          handleUploadUrl: "/api/public/estimate-vsl-upload",
          multipart: true,
          contentType,
          onUploadProgress: ({ percentage }) => setUploadProgress(Math.round(percentage)),
        }
      );
      setSettings((current) =>
        current ? { ...current, estimateVslVideoUrl: blob.url } : current
      );
      toast.success("Estimate video uploaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Video upload failed");
    } finally {
      setUploadingVideo(false);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  }

  async function removeVslVideo() {
    if (!settings || !window.confirm("Remove this estimate video?")) return;
    const response = await fetch("/api/settings/estimates/vsl", { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error ?? "Could not remove video");
      return;
    }
    setSettings({
      ...settings,
      estimateVslEnabled: false,
      estimateVslVideoUrl: null,
    });
    toast.success("Estimate video removed");
  }

  if (!settings) {
    return (
      <ContentArea className="max-w-2xl">
        <PageHeader breadcrumb={["Settings", "Estimates"]} title="Estimates" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </ContentArea>
    );
  }

  return (
    <ContentArea className="max-w-2xl">
      <PageHeader
        breadcrumb={["Settings", "Estimates"]}
        title="Estimates"
        subtitle="Default expiry, customer warranty copy, portal deposits, and post-approval scheduling deposits"
      />

      <form onSubmit={handleSave} className="space-y-6">
        <section className="rounded-lg border border-border bg-white p-4">
          <h3 className="mb-4 text-lg font-semibold">Defaults</h3>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Estimate expiry (days)</label>
              <Input
                type="number"
                min={1}
                value={settings.estimateExpiryDays}
                onChange={(e) =>
                  setSettings({ ...settings, estimateExpiryDays: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Warranty (customer estimate page)</label>
              <textarea
                className="min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={settings.estimateWarrantyText ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    estimateWarrantyText: e.target.value || null,
                  })
                }
                placeholder="Example: All labor and materials are covered by our 1-year workmanship warranty…"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Shown on the estimate link customers open from email or SMS. Leave blank to hide the
                warranty section.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Permanent lights financing link
              </label>
              <Input
                type="url"
                value={settings.estimateFinancingUrl ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    estimateFinancingUrl: e.target.value || null,
                  })
                }
                placeholder="https://..."
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Shown only while a customer is viewing a permanent-lighting option. The “Pay as low
                as $99/mo when you qualify” button opens this link in a separate tab.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={settings.estimateDepositRequired}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, estimateDepositRequired: Boolean(checked) })
                }
              />
              <label className="text-sm">Require deposit on estimates</label>
            </div>
            {settings.estimateDepositRequired && (
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Require when total is over
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={Number(settings.deferredVisitDepositThreshold ?? 1000)}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        estimateDepositThreshold: e.target.value ? Number(e.target.value) : 0,
                        deferredVisitDepositThreshold: e.target.value
                          ? Number(e.target.value)
                          : 0,
                      })
                    }
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Used when the customer approves the estimate and when approved work is booked
                    for another day. Totals at or below this amount do not require a deposit.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Deposit type</label>
                  <select
                    value={settings.estimateDepositType ?? "FIXED"}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        estimateDepositType: e.target.value as "PERCENT" | "FIXED",
                      })
                    }
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    <option value="FIXED">Fixed amount</option>
                    <option value="PERCENT">Percentage</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    {settings.estimateDepositType === "PERCENT"
                      ? "Deposit percent"
                      : "Deposit amount"}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={settings.estimateDepositType === "PERCENT" ? 100 : undefined}
                    step="0.01"
                    value={settings.estimateDepositAmount ?? ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        estimateDepositAmount: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-white p-4">
          <h3 className="text-lg font-semibold">Estimate intro video (VSL)</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Require first-time customers to view this video before their estimate is revealed.
            Returning customers who already completed it can continue immediately.
          </p>

          <div className="mt-4 space-y-4">
            <div className="flex items-start gap-3">
              <Checkbox
                checked={settings.estimateVslEnabled}
                disabled={!settings.estimateVslVideoUrl}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, estimateVslEnabled: Boolean(checked) })
                }
              />
              <div>
                <label className="text-sm font-medium">Require video before viewing estimates</label>
                {!settings.estimateVslVideoUrl ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Upload a video before enabling this setting.
                  </p>
                ) : null}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Required wait (seconds)</label>
              <Input
                type="number"
                min={0}
                max={3600}
                step={1}
                value={settings.estimateVslWaitSeconds ?? 30}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    estimateVslWaitSeconds: event.target.value
                      ? Number(event.target.value)
                      : 30,
                  })
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Defaults to 30 seconds. Customers can seek or fast-forward, and finishing the video
                unlocks their estimate even if this time has not elapsed.
              </p>
            </div>

            {settings.estimateVslVideoUrl ? (
              <div className="space-y-3">
                <video
                  src={
                    absolutePublicBlobUrl(settings.estimateVslVideoUrl) ??
                    settings.estimateVslVideoUrl
                  }
                  controls
                  preload="metadata"
                  className="aspect-video w-full rounded-lg border bg-black"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => videoInputRef.current?.click()}
                    disabled={uploadingVideo}
                  >
                    <Upload className="h-4 w-4" />
                    Replace video
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => void removeVslVideo()}
                    disabled={uploadingVideo}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove video
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => videoInputRef.current?.click()}
                disabled={uploadingVideo}
              >
                {uploadingVideo ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {uploadingVideo ? `Uploading ${uploadProgress}%` : "Upload VSL video"}
              </Button>
            )}
            {settings.estimateVslVideoUrl && uploadingVideo ? (
              <div className="space-y-1">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-[width]"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Uploading {uploadProgress}%</p>
              </div>
            ) : null}
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadVslVideo(file);
              }}
            />
            <p className="text-xs text-muted-foreground">
              MP4 is recommended for the best mobile compatibility. Large videos upload in parts,
              up to the 5 TB storage-provider limit.
            </p>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-white p-4">
          <h3 className="mb-1 text-lg font-semibold">Deferred visit deposit</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            After a technician approves an estimate, they choose whether the work is done{" "}
            <span className="font-medium text-foreground">today</span> or on{" "}
            <span className="font-medium text-foreground">another day</span>. When they book for
            another day, these rules decide if a deposit must be collected before leaving.
          </p>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Deposit percent</label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={Number(settings.deferredVisitDepositPercent ?? 50)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    deferredVisitDepositPercent: e.target.value
                      ? Number(e.target.value)
                      : 50,
                  })
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Uses the shared threshold above. When it is exceeded, collect this percentage of
                the visit total for work booked for another day.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-white p-4">
          <h3 className="mb-4 text-lg font-semibold">Install & supplier</h3>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Default install duration (days)</label>
              <Input
                type="number"
                min={1}
                value={settings.defaultInstallDurationDays ?? 4}
                onChange={(e) =>
                  setSettings({ ...settings, defaultInstallDurationDays: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Supplier email (parts list)</label>
              <Input
                type="email"
                value={settings.supplierEmail ?? ""}
                onChange={(e) => setSettings({ ...settings, supplierEmail: e.target.value || null })}
                placeholder="orders@supplier.com"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={settings.supplierPartsAutoSend ?? false}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, supplierPartsAutoSend: Boolean(checked) })
                }
              />
              <label className="text-sm">Email parts list to supplier when estimate is approved</label>
            </div>
          </div>
        </section>

        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save settings"}
        </Button>
      </form>
    </ContentArea>
  );
}
