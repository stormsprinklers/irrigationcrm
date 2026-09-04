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
import { EstimateSendDialog } from "@/components/estimates/EstimateSendDialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { blobProxyUrl } from "@/lib/blob/urls";
import type { ResolvedAddress } from "@/lib/customers/address-autocomplete";
import type { CustomerDTO, CustomerPropertyDTO } from "@/lib/customers/types";
import type { HolidayPricingResult } from "@/lib/holiday-lighting/pricing";
import { pruneStrands } from "@/lib/holiday-lighting/strands";
import {
  DEFAULT_HOLIDAY_CATALOG,
  DEFAULT_HOLIDAY_SELECTIONS,
  EMPTY_HOLIDAY_MEASUREMENTS,
  HOLIDAY_PREVIEW_DISCLAIMER,
  applyHolidayCatalogPolicy,
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
  propertyId: string | null;
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

type WizardStep = 1 | 2 | 3 | 4 | 5;

const WIZARD_STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: 1, label: "Location" },
  { id: 2, label: "Measure" },
  { id: 3, label: "Lights" },
  { id: 4, label: "Preview" },
  { id: 5, label: "Quote" },
];

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function formatAddressLine(address: string, city: string, state: string, zip: string) {
  const cityState = [city.trim(), state.trim()].filter(Boolean).join(", ");
  const tail = [cityState, zip.trim()].filter(Boolean).join(" ");
  const street = address.trim();
  if (!street) return tail;
  if (!tail) return street;
  if (city.trim() && street.toLowerCase().includes(city.trim().toLowerCase())) return street;
  return `${street}, ${tail}`;
}

function addressGeocodeKey(address: string, city: string, state: string, zip: string) {
  return [address, city, state, zip]
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .join("|");
}

function displayAddressQuery(
  address: string,
  city: string,
  state: string,
  zip: string
) {
  if (address || city.trim() || zip.trim()) {
    return formatAddressLine(address, city, state, zip);
  }
  return "";
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
  const [addressQuery, setAddressQuery] = useState(() =>
    displayAddressQuery(
      initialAddress ?? "",
      initialCity ?? "",
      initialState ?? "",
      initialZip ?? ""
    )
  );
  const [customerId, setCustomerId] = useState(initialCustomerId ?? "");
  const [customerName, setCustomerName] = useState(initialCustomerName ?? "");
  const [propertyId, setPropertyId] = useState("");
  const [properties, setProperties] = useState<CustomerPropertyDTO[]>([]);
  const [center, setCenter] = useState<HolidayLatLng | null>(null);
  const [measurements, setMeasurements] = useState<HolidayMeasurements>(EMPTY_HOLIDAY_MEASUREMENTS);
  const [selections, setSelections] = useState<HolidayQuoteSelections>(DEFAULT_HOLIDAY_SELECTIONS);
  const [catalog, setCatalog] = useState<HolidayLightingCatalog>(DEFAULT_HOLIDAY_CATALOG);
  const [pricing, setPricing] = useState<HolidayPricingResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoApproved, setPhotoApproved] = useState(false);
  const [estimate, setEstimate] = useState<QuoteRecord["estimate"]>(null);
  const [previewSource, setPreviewSource] = useState<"choose" | "street" | "upload">("choose");
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);

  const paintRef = useRef<PaintCanvasHandle | null>(null);
  const mapPanelRef = useRef<HolidayMapPanelHandle | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastGeocodedKey = useRef("");
  const geocodeSeq = useRef(0);

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
      setAddressQuery(
        displayAddressQuery(q.address ?? "", q.city ?? "", q.state ?? "", q.zip ?? "")
      );
      lastGeocodedKey.current =
        q.lat != null && q.lng != null
          ? addressGeocodeKey(q.address ?? "", q.city ?? "", q.state ?? "", q.zip ?? "")
          : "";
      setCustomerId(q.customerId ?? "");
      setCustomerName(q.customer?.name ?? "");
      setPropertyId(q.propertyId ?? "");
      setCenter(q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : null);
      setMeasurements(parseHolidayMeasurements(q.measurements));
      const nextCatalog = (data.catalog as HolidayLightingCatalog | undefined) ?? DEFAULT_HOLIDAY_CATALOG;
      setCatalog(nextCatalog);
      setSelections(
        applyHolidayCatalogPolicy(parseHolidaySelections(q.selections), nextCatalog)
      );
      setPreviewUrl(q.previewImageUrl);
      const loadedPhoto = q.sourcePhotoUrl
        ? blobProxyUrl(q.sourcePhotoUrl) ?? q.sourcePhotoUrl
        : null;
      setPhotoUrl(loadedPhoto);
      setPhotoApproved(Boolean(loadedPhoto));
      setEstimate(q.estimate ?? null);
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
            setAddressQuery(
              displayAddressQuery(
                customer.address ?? "",
                customer.city ?? "",
                customer.state ?? "UT",
                customer.zip ?? ""
              )
            );
          }
        })
        .catch(() => {});
    }
  }, [initialId, loadQuote, initialCustomerId, initialCustomerName, initialAddress]);

  useEffect(() => {
    if (!customerId) {
      setProperties([]);
      setPropertyId("");
      return;
    }
    let cancelled = false;
    fetch(`/api/customers/${customerId}/properties`)
      .then(async (r) => {
        if (!r.ok) return;
        const list = (await r.json()) as CustomerPropertyDTO[];
        if (cancelled) return;
        setProperties(list);
        setPropertyId((prev) => {
          if (prev && list.some((p) => p.id === prev)) return prev;
          if (list.length === 1) return list[0]!.id;
          return "";
        });
      })
      .catch(() => {
        if (!cancelled) setProperties([]);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  async function ensureQuote(): Promise<string> {
    if (quoteId) return quoteId;
    const res = await fetch("/api/holiday-lighting/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: customerId || null,
        propertyId: propertyId || null,
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
      propertyId: string | null;
      sourcePhotoUrl: string | null;
      previewImageUrl: string | null;
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
    const refreshed = pruneStrands(next);
    setMeasurements(refreshed);
    void save({ measurements: refreshed }, { quiet });
  }

  async function geocode(fields?: {
    address: string;
    city: string;
    state: string;
    zip: string;
  }) {
    const payload = fields ?? { address, city, state, zip };
    const query =
      formatAddressLine(payload.address, payload.city, payload.state, payload.zip).trim() ||
      payload.address.trim();
    if (query.replace(/\s/g, "").length < 6) return;

    const key = addressGeocodeKey(payload.address, payload.city, payload.state, payload.zip);
    if (key === lastGeocodedKey.current) return;

    const seq = ++geocodeSeq.current;
    try {
      const res = await fetch("/api/holiday-lighting/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (seq !== geocodeSeq.current) return;
      lastGeocodedKey.current = key;
      if (!res.ok) throw new Error(data.error ?? "Geocode failed");
      setCenter({ lat: data.lat, lng: data.lng });
      await save(
        {
          address: payload.address,
          city: payload.city,
          state: payload.state,
          zip: payload.zip,
          lat: data.lat,
          lng: data.lng,
        },
        { quiet: true }
      );
    } catch (err) {
      if (seq !== geocodeSeq.current) return;
      toast.error(err instanceof Error ? err.message : "Geocode failed");
    }
  }

  function applyResolvedAddress(resolved: ResolvedAddress) {
    const nextAddress = resolved.address ?? address;
    const nextCity = resolved.city ?? city;
    const nextState = resolved.state ?? state;
    const nextZip = resolved.zip ?? zip;
    setAddress(nextAddress);
    setCity(nextCity);
    setState(nextState);
    setZip(nextZip);
    setAddressQuery(displayAddressQuery(nextAddress, nextCity, nextState, nextZip));
    if (resolved.latitude != null && resolved.longitude != null) {
      lastGeocodedKey.current = addressGeocodeKey(nextAddress, nextCity, nextState, nextZip);
      setCenter({ lat: resolved.latitude, lng: resolved.longitude });
      void save(
        {
          address: nextAddress,
          city: nextCity,
          state: nextState,
          zip: nextZip,
          lat: resolved.latitude,
          lng: resolved.longitude,
        },
        { quiet: true }
      );
      return;
    }
    void geocode({
      address: nextAddress,
      city: nextCity,
      state: nextState,
      zip: nextZip,
    });
  }

  function applyProperty(property: CustomerPropertyDTO) {
    setPropertyId(property.id);
    setAddress(property.address ?? "");
    setCity(property.city ?? "");
    setState(property.state ?? "UT");
    setZip(property.zip ?? "");
    setAddressQuery(
      displayAddressQuery(
        property.address ?? "",
        property.city ?? "",
        property.state ?? "UT",
        property.zip ?? ""
      )
    );
    void save(
      {
        propertyId: property.id,
        address: property.address ?? "",
        city: property.city ?? "",
        state: property.state ?? "UT",
        zip: property.zip ?? "",
      },
      { quiet: true }
    );
    void geocode({
      address: property.address ?? "",
      city: property.city ?? "",
      state: property.state ?? "UT",
      zip: property.zip ?? "",
    });
  }

  function onCustomerPicked(id: string, name: string) {
    setCustomerId(id);
    setCustomerName(name);
    if (!id) {
      setPropertyId("");
      setProperties([]);
      void save({ customerId: null, propertyId: null }, { quiet: true });
    }
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
      setAddressQuery(
        displayAddressQuery(
          customer.address ?? "",
          customer.city ?? "",
          customer.state ?? "UT",
          customer.zip ?? ""
        )
      );
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
      void geocode({
        address: customer.address ?? "",
        city: customer.city ?? "",
        state: customer.state ?? "UT",
        zip: customer.zip ?? "",
      });
    } else {
      void save({ customerId: customer.id }, { quiet: true });
    }
  }

  const addressLine = useMemo(
    () => formatAddressLine(address, city, state, zip),
    [address, city, state, zip]
  );

  useEffect(() => {
    const query = (addressLine || address).trim();
    if (query.replace(/\s/g, "").length < 6) return;
    const key = addressGeocodeKey(address, city, state, zip);
    if (key === lastGeocodedKey.current) return;
    const timer = window.setTimeout(() => {
      void geocode({ address, city, state, zip });
    }, 750);
    return () => window.clearTimeout(timer);
    // geocode reads latest fields from this effect's snapshot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, city, state, zip, addressLine]);

  async function onPhotoSelected(file: File) {
    setPhotoUrl(URL.createObjectURL(file));
    setPhotoApproved(false);
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
      setPhotoApproved(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not capture Street View");
    } finally {
      setCapturing(false);
    }
  }

  async function goNext() {
    if (step === 1) {
      if (!address.trim() && !customerId) {
        toast.error("Enter an address or pick a customer");
        return;
      }
      await save(undefined, { quiet: true });
      setStep(2);
      return;
    }
    if (step === 2) {
      if (measurements.segments.length === 0 && measurements.placements.length === 0) {
        toast.error("Draw rooflines or mark trees and bushes on the satellite map");
        return;
      }
      await save(undefined, { quiet: true });
      setStep(3);
      return;
    }
    if (step === 3) {
      await save(undefined, { quiet: true });
      setStep(4);
      return;
    }
    if (step === 4) {
      await save(undefined, { quiet: true });
      setStep(5);
    }
  }

  function goBack() {
    if (step <= 1) return;
    setStep((prev) => (prev - 1) as WizardStep);
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
      form.set("lightStyle", selections.defaultLightStyleKey);
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
      setSendDialogOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create estimate failed");
    } finally {
      setCreating(false);
    }
  }

  async function clearQuoteWork() {
    setMeasurements(EMPTY_HOLIDAY_MEASUREMENTS);
    setSelectedSegmentId(null);
    setPhotoUrl(null);
    setPhotoApproved(false);
    setPreviewUrl(null);
    setPricing(null);
    setStep(1);
    setClearConfirmOpen(false);
    await save(
      {
        measurements: EMPTY_HOLIDAY_MEASUREMENTS,
        sourcePhotoUrl: null,
        previewImageUrl: null,
      },
      { quiet: true }
    );
    toast.success("Quote measurements cleared");
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading quote…</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 text-sm sm:gap-2">
          {WIZARD_STEPS.map((item, index) => (
            <div key={item.id} className="flex items-center gap-1 sm:gap-2">
              {index > 0 ? <span className="text-muted-foreground">→</span> : null}
              <button
                type="button"
                className={cn(
                  "rounded-full px-3 py-1 font-medium",
                  step === item.id
                    ? "bg-primary text-primary-foreground"
                    : step > item.id
                      ? "bg-muted text-foreground"
                      : "bg-muted text-muted-foreground"
                )}
                onClick={() => {
                  if (item.id <= step) setStep(item.id);
                }}
              >
                {item.id} · {item.label}
              </button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setClearConfirmOpen(true)}
          >
            Clear quote
          </Button>
          <Button type="button" variant="outline" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save draft"}
          </Button>
          {step > 1 ? (
            <Button type="button" variant="outline" onClick={goBack}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Button>
          ) : null}
          {step < 5 ? (
            <Button type="button" onClick={() => void goNext()}>
              Continue
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white p-2">
        <CustomerSearchPicker
          compact
          className="w-full min-w-[180px] sm:w-56"
          value={customerId}
          selectedName={customerName}
          onValueChange={onCustomerPicked}
          onCustomerSelect={onCustomerSelect}
          placeholder="Customer…"
        />
        {properties.length > 0 ? (
          <select
            className="h-9 min-w-[140px] max-w-[220px] flex-1 rounded-md border border-input bg-background px-2 text-sm sm:flex-none"
            value={propertyId}
            onChange={(e) => {
              const next = properties.find((p) => p.id === e.target.value);
              if (next) applyProperty(next);
              else {
                setPropertyId("");
                void save({ propertyId: null }, { quiet: true });
              }
            }}
            aria-label="Property"
          >
            <option value="">Property…</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.address || "Property"}
              </option>
            ))}
          </select>
        ) : null}
        <div className="min-w-[220px] flex-[2]">
          <AddressAutocompleteInput
            value={addressQuery}
            onChange={(value) => {
              setAddressQuery(value);
              setAddress(value);
              setCity("");
              setState("");
              setZip("");
            }}
            onResolved={applyResolvedAddress}
            onBlur={() =>
              void geocode({
                address: city.trim() || zip.trim() ? address : addressQuery,
                city,
                state,
                zip,
              })
            }
            placeholder="Address, city, state, ZIP…"
          />
        </div>
      </div>

      {step === 1 ? (
        <p className="text-sm text-muted-foreground">
          Pick a customer or enter the property address, then continue to measure the home from
          satellite.
        </p>
      ) : null}

      <div className={cn("relative z-0 flex min-h-0 flex-1 flex-col gap-2", step !== 2 && step !== 4 && "hidden")}>
        {step === 2 ? (
          <p className="text-sm text-muted-foreground">
            Draw linear rooflines on satellite. Mark any line that includes a peak to bill it at
            1.5×. Click trees and bushes and set small, medium, or large.
          </p>
        ) : null}
        {step === 4 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={previewSource === "upload" ? "default" : "outline"}
              onClick={() => {
                setPreviewSource("upload");
                fileRef.current?.click();
              }}
            >
              Upload photo for preview
            </Button>
            <Button
              type="button"
              size="sm"
              variant={previewSource === "street" ? "default" : "outline"}
              onClick={() => setPreviewSource("street")}
            >
              Find on Google Street View
            </Button>
            {previewSource === "street" ? (
              <Button
                type="button"
                size="sm"
                disabled={capturing}
                onClick={() => void captureStreetView()}
              >
                {capturing ? "Capturing…" : "Capture this view"}
              </Button>
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setPreviewSource("upload");
                  void onPhotoSelected(file);
                }
                e.target.value = "";
              }}
            />
          </div>
        ) : null}
        {step === 4 && photoUrl && !photoApproved ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="Capture preview" className="h-16 w-24 rounded object-cover" />
            <Button type="button" size="sm" onClick={() => setPhotoApproved(true)}>
              Use this photo
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setPhotoUrl(null);
                setPhotoApproved(false);
              }}
            >
              Discard
            </Button>
          </div>
        ) : null}
        <HolidayMapPanel
          ref={mapPanelRef}
          center={center}
          measurements={measurements}
          defaultLightStyleKey={selections.defaultLightStyleKey}
          onSelectSegment={setSelectedSegmentId}
          selectedSegmentId={selectedSegmentId}
          showStreetView={step === 4 && previewSource === "street"}
          showSatellite={step === 2}
          onChange={(next) => {
            const segments = next.segments.map((seg) => {
              const prev = measurements.segments.find((s) => s.id === seg.id);
              if (!prev) {
                return {
                  ...seg,
                  horizontalLengthFt: seg.horizontalLengthFt ?? seg.lengthFt,
                };
              }
              const pathChanged = JSON.stringify(prev.path) !== JSON.stringify(seg.path);
              if (pathChanged) {
                return { ...seg, horizontalLengthFt: seg.lengthFt, hasPeak: prev.hasPeak };
              }
              return {
                ...seg,
                horizontalLengthFt: prev.horizontalLengthFt ?? seg.lengthFt,
                hasPeak: seg.hasPeak ?? prev.hasPeak,
              };
            });
            updateMeasurements({ ...next, segments });
          }}
        />
      </div>

      {step === 3 ? (
        <section className="max-w-lg space-y-4 rounded-lg border border-border bg-white p-4">
          <h3 className="text-sm font-semibold">Light color</h3>
          <div>
            <label className="text-xs text-muted-foreground">Color</label>
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selections.defaultLightStyleKey}
              onChange={(e) => {
                const next = applyHolidayCatalogPolicy(
                  { ...selections, defaultLightStyleKey: e.target.value },
                  catalog
                );
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
          {pricing ? (
            <div className="space-y-2 rounded-md bg-muted/40 p-3 text-sm">
              <div>
                <div className="flex justify-between">
                  <span>Buy Lights</span>
                  <span className="font-semibold">{money(pricing.year1Total)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Future years: {money(pricing.reinstallTotal)}
                </p>
              </div>
              <div>
                <div className="flex justify-between">
                  <span>
                    Lease Lights{" "}
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                      Most popular
                    </span>
                  </span>
                  <span className="font-semibold">{money(pricing.leaseTotal)}</span>
                </div>
                <p className="text-xs text-muted-foreground">No commitments</p>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Permanent Lights</span>
                <span>{money(pricing.permanentTotal)}</span>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {step === 4 && photoApproved && photoUrl ? (
        <section className="space-y-3 rounded-lg border border-border bg-white p-4">
          <h3 className="text-sm font-semibold">AI lighting preview</h3>
          <p className="text-xs text-muted-foreground">
            Paint where lights should go. We&apos;ll generate a night photo with{" "}
            {catalog.lightStyles.find((s) => s.key === selections.defaultLightStyleKey)?.label ??
              "your lights"}
            , a little snow, and a wreath on the door.
          </p>
          <PaintCanvas imageUrl={photoUrl} canvasRef={paintRef} disabled={visualizing} />
          <Button type="button" disabled={visualizing} onClick={() => void runVisualize()}>
            {visualizing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate night preview
              </>
            )}
          </Button>
          {previewUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={blobProxyUrl(previewUrl) ?? previewUrl}
                alt="Lighting preview"
                className="w-full max-w-xl rounded-md border border-border"
              />
              <p className="text-xs text-muted-foreground">{HOLIDAY_PREVIEW_DISCLAIMER}</p>
            </>
          ) : null}
        </section>
      ) : null}

      {step === 5 ? (
        <div className="flex max-w-xl flex-col gap-4">
          {previewUrl ? (
            <section className="space-y-2 rounded-lg border border-border bg-white p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={blobProxyUrl(previewUrl) ?? previewUrl}
                alt="Lighting preview"
                className="w-full rounded-md border border-border"
              />
              <p className="text-xs text-muted-foreground">{HOLIDAY_PREVIEW_DISCLAIMER}</p>
            </section>
          ) : null}
          <section className="space-y-3 rounded-lg border border-border bg-white p-4">
            <h3 className="text-sm font-semibold">Quote</h3>
            {pricing ? (
              <div className="space-y-3 text-sm">
                <div>
                  <div className="flex justify-between">
                    <span>Buy Lights</span>
                    <span className="font-semibold">{money(pricing.year1Total)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Future years: {money(pricing.reinstallTotal)}. Front-loads the cost so you own
                    the lights and pay less later. Includes installation, take-down, and bulb
                    replacements during the season.
                  </p>
                </div>
                <div>
                  <div className="flex justify-between">
                    <span>
                      Lease Lights{" "}
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                        Most popular
                      </span>
                    </span>
                    <span className="font-semibold">{money(pricing.leaseTotal)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    No commitments. Lower up front, can cost more long-term, and you can change
                    colors and design each year. Includes installation, take-down, and bulb
                    replacements during the season.
                  </p>
                </div>
                <div>
                  <div className="flex justify-between">
                    <span>Permanent Lights</span>
                    <span className="font-semibold">{money(pricing.permanentTotal)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Fit your vibe year-round. Highest up-front cost, then change colors with an
                    app for teams, causes, and holidays — not just Christmas.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {Math.round(pricing.billedLengthFt)} ft billed
                  {pricing.placementCount
                    ? ` · ${pricing.placementCount} trees/bushes`
                    : ""}
                  {pricing.year1MinimumApplied ? " · buy first-year minimum applied" : ""}
                </p>
                {pricing.year1Total > 0 && pricing.leaseTotal <= 0 ? (
                  <p className="text-xs text-amber-800">
                    Seasonal lease is $0.00. Add a lease price per foot in Settings → Holiday
                    lighting before sending this quote.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Save measurements to see pricing.</p>
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
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setSendDialogOpen(true)}
                >
                  Preview &amp; send estimate
                </Button>
                <Button type="button" variant="outline" className="w-full" asChild>
                  <Link href={`/estimates/${estimate.id}`}>
                    Open {estimate.estimateNumber ?? "estimate"}
                  </Link>
                </Button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
      <ConfirmDialog
        open={clearConfirmOpen}
        title="Clear this lighting quote?"
        description="This removes all rooflines, trees/bushes, the captured photo, and any AI preview. Customer and address are kept."
        confirmLabel="Clear everything"
        confirmVariant="destructive"
        onConfirm={() => void clearQuoteWork()}
        onCancel={() => setClearConfirmOpen(false)}
      />
      <EstimateSendDialog
        open={sendDialogOpen}
        estimateId={estimate?.id ?? null}
        onClose={() => setSendDialogOpen(false)}
        onSent={() => {
          if (estimate) {
            setEstimate({ ...estimate, status: "SENT" });
          }
        }}
      />
    </div>
  );
}
