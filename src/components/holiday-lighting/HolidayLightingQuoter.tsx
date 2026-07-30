"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AddressAutocompleteInput } from "@/components/customers/AddressFields";
import { CustomerSearchPicker } from "@/components/customers/CustomerSearchPicker";
import {
  HolidayMapPanel,
  type HolidayMapPanelHandle,
} from "@/components/holiday-lighting/HolidayMapPanel";
import {
  PaintCanvas,
  type PaintCanvasHandle,
} from "@/components/holiday-lighting/PaintCanvas";
import { StreetViewMeasureOverlay } from "@/components/holiday-lighting/StreetViewMeasureOverlay";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { blobProxyUrl } from "@/lib/blob/urls";
import type { ResolvedAddress } from "@/lib/customers/address-autocomplete";
import type { CustomerDTO } from "@/lib/customers/types";
import { billedSegmentLengthFt, refreshPitchCorrections } from "@/lib/holiday-lighting/pitch-match";
import type { HolidayPricingResult } from "@/lib/holiday-lighting/pricing";
import {
  DEFAULT_HOLIDAY_CATALOG,
  DEFAULT_HOLIDAY_SELECTIONS,
  EMPTY_HOLIDAY_MEASUREMENTS,
  holidaySelectionsFromCatalog,
  parseHolidayMeasurements,
  parseHolidaySelections,
  type HolidayLatLng,
  type HolidayLightingCatalog,
  type HolidayMeasurements,
  type HolidayQuoteSelections,
} from "@/lib/holiday-lighting/types";
import { getBrowserMapsApiKey } from "@/lib/holiday-lighting/load-maps";
import { cn } from "@/lib/utils";

type QuoteRecord = {
  id: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  customerId: string | null;
  measurements: unknown;
  selections: unknown;
  previewImageUrl: string | null;
  sourcePhotoUrl: string | null;
  estimateId: string | null;
  customer?: { id: string; name: string; email: string | null; phone: string | null } | null;
  estimate?: { id: string; estimateNumber: string | null; status: string } | null;
};

type Props = {
  quoteId?: string;
  initialCustomerId?: string | null;
  initialCustomerName?: string | null;
  initialAddress?: string | null;
  initialCity?: string | null;
  initialState?: string | null;
  initialZip?: string | null;
};

type WizardStep = 1 | 2;

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export function HolidayLightingQuoter({
  quoteId: initialId,
  initialCustomerId,
  initialCustomerName,
  initialAddress,
  initialCity,
  initialState,
  initialZip,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(1);
  const [quoteId, setQuoteId] = useState(initialId ?? "");
  const [loading, setLoading] = useState(Boolean(initialId));
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [visualizing, setVisualizing] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const [address, setAddress] = useState(initialAddress ?? "");
  const [city, setCity] = useState(initialCity ?? "");
  const [state, setState] = useState(initialState ?? "UT");
  const [zip, setZip] = useState(initialZip ?? "");
  const [customerId, setCustomerId] = useState(initialCustomerId ?? "");
  const [customerName, setCustomerName] = useState(initialCustomerName ?? "");
  const [center, setCenter] = useState<HolidayLatLng | null>(null);
  const [measurements, setMeasurements] = useState<HolidayMeasurements>(EMPTY_HOLIDAY_MEASUREMENTS);
  const [selections, setSelections] = useState<HolidayQuoteSelections>(DEFAULT_HOLIDAY_SELECTIONS);
  const [catalog, setCatalog] = useState<HolidayLightingCatalog>(DEFAULT_HOLIDAY_CATALOG);
  const [pricing, setPricing] = useState<HolidayPricingResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<QuoteRecord["estimate"]>(null);
  const [matchSegmentId, setMatchSegmentId] = useState<string | null>(null);

  const paintRef = useRef<PaintCanvasHandle | null>(null);
  const mapPanelRef = useRef<HolidayMapPanelHandle | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadQuote = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/holiday-lighting/quotes/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load quote");
      const q = data.quote as QuoteRecord;
      setQuoteId(q.id);
      setAddress(q.address ?? "");
      setCity(q.city ?? "");
      setState(q.state ?? "UT");
      setZip(q.zip ?? "");
      setCustomerId(q.customerId ?? "");
      setCustomerName(q.customer?.name ?? "");
      setCenter(q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : null);
      setMeasurements(parseHolidayMeasurements(q.measurements));
      setSelections(parseHolidaySelections(q.selections));
      setPreviewUrl(q.previewImageUrl);
      setPhotoUrl(q.sourcePhotoUrl ? blobProxyUrl(q.sourcePhotoUrl) ?? q.sourcePhotoUrl : null);
      setEstimate(q.estimate ?? null);
      if (data.catalog) setCatalog(data.catalog);
      if (data.pricing) setPricing(data.pricing);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialId) {
      void loadQuote(initialId);
      return;
    }
    fetch("/api/settings/holiday-lighting")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) return;
        const nextCatalog = data.catalog as HolidayLightingCatalog;
        setCatalog(nextCatalog);
        setSelections(holidaySelectionsFromCatalog(nextCatalog));
      })
      .catch(() => {});

    if (initialCustomerId && !initialCustomerName) {
      fetch(`/api/customers/${initialCustomerId}`)
        .then(async (r) => {
          if (!r.ok) return;
          const customer = (await r.json()) as CustomerDTO;
          if (customer?.name) setCustomerName(customer.name);
          if (!initialAddress && customer?.address) {
            setAddress(customer.address ?? "");
            setCity(customer.city ?? "");
            setState(customer.state ?? "UT");
            setZip(customer.zip ?? "");
          }
        })
        .catch(() => {});
    }
  }, [initialId, loadQuote, initialCustomerId, initialCustomerName, initialAddress]);

  async function ensureQuote(): Promise<string> {
    if (quoteId) return quoteId;
    const res = await fetch("/api/holiday-lighting/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: customerId || null,
        address,
        city,
        state,
        zip,
        lat: center?.lat ?? null,
        lng: center?.lng ?? null,
        measurements,
        selections,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to create quote");
    setQuoteId(data.quote.id);
    router.replace(`/holiday-lighting/quote/${data.quote.id}`);
    return data.quote.id as string;
  }

  async function save(
    patch?: Partial<{
      measurements: HolidayMeasurements;
      selections: HolidayQuoteSelections;
      address: string;
      city: string;
      state: string;
      zip: string;
      lat: number | null;
      lng: number | null;
      customerId: string | null;
      sourcePhotoUrl: string | null;
    }>,
    opts?: { quiet?: boolean }
  ) {
    setSaving(true);
    try {
      const id = await ensureQuote();
      const body = {
        address,
        city,
        state,
        zip,
        lat: center?.lat ?? null,
        lng: center?.lng ?? null,
        customerId: customerId || null,
        measurements,
        selections,
        ...patch,
      };
      const res = await fetch(`/api/holiday-lighting/quotes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      if (data.pricing) setPricing(data.pricing);
      if (!opts?.quiet) toast.success("Quote saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function updateMeasurements(next: HolidayMeasurements, quiet = true) {
    const refreshed = refreshPitchCorrections(next);
    setMeasurements(refreshed);
    void save({ measurements: refreshed }, { quiet });
  }

  async function geocode() {
    try {
      const res = await fetch("/api/holiday-lighting/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, city, state, zip }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Geocode failed");
      setCenter({ lat: data.lat, lng: data.lng });
      toast.success("Map centered on address");
      await save({ lat: data.lat, lng: data.lng }, { quiet: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Geocode failed");
    }
  }

  function applyResolvedAddress(resolved: ResolvedAddress) {
    setAddress(resolved.address ?? address);
    setCity(resolved.city ?? city);
    setState(resolved.state ?? state);
    setZip(resolved.zip ?? zip);
    if (resolved.latitude != null && resolved.longitude != null) {
      setCenter({ lat: resolved.latitude, lng: resolved.longitude });
      void save(
        {
          address: resolved.address ?? address,
          city: resolved.city ?? city,
          state: resolved.state ?? state,
          zip: resolved.zip ?? zip,
          lat: resolved.latitude,
          lng: resolved.longitude,
        },
        { quiet: true }
      );
    }
  }

  function onCustomerPicked(id: string, name: string) {
    setCustomerId(id);
    setCustomerName(name);
    if (!id) void save({ customerId: null }, { quiet: true });
  }

  function onCustomerSelect(customer: CustomerDTO) {
    setCustomerId(customer.id);
    setCustomerName(customer.name);
    const shouldPrefill = !address.trim() && Boolean(customer.address);
    if (shouldPrefill) {
      setAddress(customer.address ?? "");
      setCity(customer.city ?? "");
      setState(customer.state ?? "UT");
      setZip(customer.zip ?? "");
      void save(
        {
          customerId: customer.id,
          address: customer.address ?? "",
          city: customer.city ?? "",
          state: customer.state ?? "UT",
          zip: customer.zip ?? "",
        },
        { quiet: true }
      );
    } else {
      void save({ customerId: customer.id }, { quiet: true });
    }
  }

  async function onPhotoSelected(file: File) {
    setPhotoUrl(URL.createObjectURL(file));
    toast.success("Photo ready — match roof angles on this image");
  }

  async function captureStreetView() {
    const pose = mapPanelRef.current?.getStreetViewPose();
    if (!pose) {
      toast.error("Street View is not ready — wait for the map to load, then aim the viewer");
      return;
    }
    setCapturing(true);
    try {
      const keyRes = await fetch("/api/holiday-lighting/maps-key");
      const keyData = await keyRes.json();
      if (!keyRes.ok) throw new Error(keyData.error ?? "Maps key unavailable");
      const key = (keyData.key as string) || getBrowserMapsApiKey();
      const params = new URLSearchParams({
        size: "1024x768",
        heading: String(pose.heading),
        pitch: String(pose.pitch),
        fov: String(pose.fov),
        key,
      });
      if (pose.panoId) params.set("pano", pose.panoId);
      else params.set("location", `${pose.lat},${pose.lng}`);
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`
      );
      if (!res.ok) throw new Error("Street View capture failed — upload a photo instead.");
      const blob = await res.blob();
      if (blob.size < 5_000) {
        throw new Error("No Street View image for this view — try a different angle or upload a photo.");
      }
      setPhotoUrl(URL.createObjectURL(blob));
      toast.success("Street View captured — match roof edges to satellite segments");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not capture Street View");
    } finally {
      setCapturing(false);
    }
  }

  async function goToStep2() {
    if (!photoUrl) {
      toast.error("Capture or upload a street photo first");
      return;
    }
    if (!measurements.segments.some((s) => s.kind === "roofline" || s.kind === "garland")) {
      toast.error("Draw at least one roofline on the satellite map");
      return;
    }
    await save(undefined, { quiet: true });
    setStep(2);
  }

  async function runVisualize() {
    if (!paintRef.current?.hasPaint()) {
      toast.error("Paint the areas where lights should go");
      return;
    }
    setVisualizing(true);
    try {
      const id = await ensureQuote();
      const exported = await paintRef.current.exportForApi();
      if (!exported) throw new Error("Could not export paint mask");
      const form = new FormData();
      form.set("clean", exported.cleanBlob, "property.png");
      form.set("marked", exported.markedBlob, "property-marked.png");
      const res = await fetch(`/api/holiday-lighting/quotes/${id}/visualize`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preview failed");
      setPreviewUrl(data.previewImageUrl);
      toast.success("Lighting preview ready");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setVisualizing(false);
    }
  }

  async function createEstimate() {
    setCreating(true);
    try {
      const id = await ensureQuote();
      await save(undefined, { quiet: true });
      const res = await fetch(`/api/holiday-lighting/quotes/${id}/create-estimate`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create estimate");
      setEstimate({
        id: data.estimate.id,
        estimateNumber: data.estimate.estimateNumber,
        status: data.estimate.status,
      });
      toast.success("Estimate created");
      router.push(`/customers/estimates/${data.estimate.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create estimate failed");
    } finally {
      setCreating(false);
    }
  }

  const totalFt = useMemo(
    () =>
      measurements.segments.reduce((s, seg) => s + billedSegmentLengthFt(seg), 0),
    [measurements.segments]
  );

  const matchedCount = useMemo(
    () =>
      measurements.segments.filter(
        (s) =>
          (s.kind === "roofline" || s.kind === "garland") && s.pitchDeg != null
      ).length,
    [measurements.segments]
  );

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading quote…</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span
            className={cn(
              "rounded-full px-3 py-1 font-medium",
              step === 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}
          >
            1 · Measure
          </span>
          <span className="text-muted-foreground">→</span>
          <span
            className={cn(
              "rounded-full px-3 py-1 font-medium",
              step === 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}
          >
            2 · Preview &amp; quote
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save draft"}
          </Button>
          {step === 1 ? (
            <Button type="button" onClick={() => void goToStep2()}>
              Continue
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to measure
            </Button>
          )}
        </div>
      </div>

      {step === 1 ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="rounded-lg border border-border bg-white p-3">
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Customer
                </label>
                <CustomerSearchPicker
                  value={customerId}
                  selectedName={customerName}
                  onValueChange={onCustomerPicked}
                  onCustomerSelect={onCustomerSelect}
                  placeholder="Search customers by name, phone, email…"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <AddressAutocompleteInput
                    value={address}
                    onChange={setAddress}
                    onResolved={applyResolvedAddress}
                    placeholder="Search street address…"
                  />
                </div>
                <Input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
                <div className="flex gap-2">
                  <Input
                    className="w-16"
                    placeholder="ST"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                  />
                  <Input placeholder="ZIP" value={zip} onChange={(e) => setZip(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => void geocode()}>
                Locate on map
              </Button>
              <p className="self-center text-xs text-muted-foreground">
                {totalFt.toFixed(1)} ft billable · {matchedCount} pitch-matched ·{" "}
                {measurements.placements.length} trees/bushes
              </p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Draw roof segments on the satellite map (plan length), capture Street View of the house,
            then match each segment on the photo to measure pitch. Plan length is the horizontal run;
            pitch converts it to true roof length and rise.
          </p>

          <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-2">
            <div className="flex min-h-[420px] flex-col gap-2">
              <h3 className="text-sm font-semibold">Satellite measure</h3>
              <HolidayMapPanel
                ref={mapPanelRef}
                center={center}
                measurements={measurements}
                defaultLightStyleKey={selections.defaultLightStyleKey}
                onChange={(next) => {
                  const segments = next.segments.map((seg) => {
                    const prev = measurements.segments.find((s) => s.id === seg.id);
                    if (!prev) {
                      return {
                        ...seg,
                        horizontalLengthFt: seg.horizontalLengthFt ?? seg.lengthFt,
                      };
                    }
                    const pathChanged =
                      JSON.stringify(prev.path) !== JSON.stringify(seg.path);
                    if (pathChanged) {
                      return { ...seg, horizontalLengthFt: seg.lengthFt };
                    }
                    return {
                      ...seg,
                      horizontalLengthFt: prev.horizontalLengthFt ?? seg.lengthFt,
                    };
                  });
                  updateMeasurements({
                    ...next,
                    segments,
                    streetTraces: (measurements.streetTraces ?? []).filter((t) =>
                      segments.some((s) => s.id === t.satelliteSegmentId)
                    ),
                  });
                }}
              />
            </div>

            <div className="flex min-h-[420px] flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Street View pitch match</h3>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={capturing}
                    onClick={() => void captureStreetView()}
                  >
                    {capturing ? "Capturing…" : "Capture Street View"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => fileRef.current?.click()}
                  >
                    Upload photo
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void onPhotoSelected(file);
                    }}
                  />
                </div>
              </div>
              {photoUrl ? (
                <StreetViewMeasureOverlay
                  imageUrl={photoUrl}
                  measurements={measurements}
                  selectedSegmentId={matchSegmentId}
                  onSelectSegment={setMatchSegmentId}
                  onChange={(next) => updateMeasurements(next)}
                />
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                  Aim the Street View panel on the map, then capture — or upload a house photo — to
                  draw roof angles on top of the image.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <section className="space-y-3 rounded-lg border border-border bg-white p-4">
              <h3 className="text-sm font-semibold">AI lighting preview</h3>
              <p className="text-xs text-muted-foreground">
                Same street photo from step 1. Paint where lights go, then generate a preview.
              </p>
              {photoUrl ? (
                <PaintCanvas imageUrl={photoUrl} canvasRef={paintRef} disabled={visualizing} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No street photo — go back to step 1 and capture one.
                </p>
              )}
              <Button
                type="button"
                className="w-full"
                disabled={visualizing || !photoUrl}
                onClick={() => void runVisualize()}
              >
                {visualizing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate AI preview
                  </>
                )}
              </Button>
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={blobProxyUrl(previewUrl) ?? previewUrl}
                  alt="Lighting preview"
                  className="w-full rounded-md border border-border"
                />
              ) : null}
            </section>
          </div>

          <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[340px]">
            <section className="space-y-3 rounded-lg border border-border bg-white p-4">
              <h3 className="text-sm font-semibold">Quote builder</h3>
              <p className="text-xs text-muted-foreground">
                {totalFt.toFixed(1)} ft measured · {measurements.placements.length} trees/bushes
              </p>

              <div>
                <label className="text-xs text-muted-foreground">Default light style</label>
                <select
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selections.defaultLightStyleKey}
                  onChange={(e) => {
                    const next = { ...selections, defaultLightStyleKey: e.target.value };
                    setSelections(next);
                    void save({ selections: next }, { quiet: true });
                  }}
                >
                  {catalog.lightStyles.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">
                  Error margin ({selections.marginPct}%)
                </label>
                <input
                  type="range"
                  min={0}
                  max={25}
                  value={selections.marginPct}
                  className="mt-1 w-full accent-primary"
                  onChange={(e) => {
                    const next = { ...selections, marginPct: Number(e.target.value) };
                    setSelections(next);
                  }}
                  onMouseUp={() => void save({ selections }, { quiet: true })}
                  onTouchEnd={() => void save({ selections }, { quiet: true })}
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selections.includeLease}
                  onCheckedChange={(checked) => {
                    const next = { ...selections, includeLease: Boolean(checked) };
                    setSelections(next);
                    void save({ selections: next }, { quiet: true });
                  }}
                />
                Include lease option
              </label>

              {pricing ? (
                <div className="space-y-1 rounded-md bg-muted/40 p-3 text-sm">
                  <div className="flex justify-between">
                    <span>Purchase</span>
                    <span className="font-semibold">{money(pricing.purchaseTotal)}</span>
                  </div>
                  {selections.includeLease ? (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Lease (season)</span>
                      <span>{money(pricing.leaseTotal)}</span>
                    </div>
                  ) : null}
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-[11px] text-muted-foreground">
                    {pricing.lines.map((line) => (
                      <li key={line.key}>
                        {line.name}: {line.staffDetail}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Save to refresh pricing.</p>
              )}

              <Button
                type="button"
                className="w-full"
                disabled={creating || !customerId}
                onClick={() => void createEstimate()}
              >
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create branded estimate"
                )}
              </Button>
              {!customerId ? (
                <p className="text-xs text-amber-700">Select a customer to create an estimate.</p>
              ) : null}
              {estimate ? (
                <Button type="button" variant="outline" className="w-full" asChild>
                  <Link href={`/customers/estimates/${estimate.id}`}>
                    Open {estimate.estimateNumber ?? "estimate"}
                  </Link>
                </Button>
              ) : null}
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
