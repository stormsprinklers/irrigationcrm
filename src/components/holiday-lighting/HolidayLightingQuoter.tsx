"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronDown, Loader2, Sparkles } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ModalPortal } from "@/components/ui/ModalPortal";
import { blobProxyUrl } from "@/lib/blob/urls";
import type { ResolvedAddress } from "@/lib/customers/address-autocomplete";
import type { CustomerDTO, CustomerPropertyDTO } from "@/lib/customers/types";
import { optionDetail, type HolidayPricingResult } from "@/lib/holiday-lighting/pricing";
import { pruneStrands } from "@/lib/holiday-lighting/strands";
import {
  DEFAULT_HOLIDAY_CATALOG,
  DEFAULT_HOLIDAY_SELECTIONS,
  EMPTY_HOLIDAY_MEASUREMENTS,
  HOLIDAY_PREVIEW_DISCLAIMER,
  HOLIDAY_COLOR_PATTERNS,
  applyHolidayCatalogPolicy,
  holidayDesignOptionsFromQuote,
  holidaySelectionsFromCatalog,
  parseHolidayMeasurements,
  parseHolidaySelections,
  type HolidayLatLng,
  type HolidayLightingCatalog,
  type HolidayMeasurements,
  type HolidayQuoteSelections,
  type HolidayQuoteDesignOption,
  type HolidayQuoteOptionKey,
  type HolidayOptionAdjustment,
  type HolidayDifficulty,
  type HolidayTreeSize,
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
  visitId: string | null;
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
  initialPropertyId?: string | null;
  initialVisitId?: string | null;
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
  initialPropertyId,
  initialVisitId,
  initialAddress,
  initialCity,
  initialState,
  initialZip,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(1);
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
  const [propertyId, setPropertyId] = useState(initialPropertyId ?? "");
  const [properties, setProperties] = useState<CustomerPropertyDTO[]>([]);
  const [center, setCenter] = useState<HolidayLatLng | null>(null);
  const [measurements, setMeasurements] = useState<HolidayMeasurements>(EMPTY_HOLIDAY_MEASUREMENTS);
  const [selections, setSelections] = useState<HolidayQuoteSelections>(DEFAULT_HOLIDAY_SELECTIONS);
  const [designOptions, setDesignOptions] = useState<HolidayQuoteDesignOption[]>([]);
  const [activeOptionId, setActiveOptionId] = useState("option-1");
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
  const [estimateChoiceOpen, setEstimateChoiceOpen] = useState(false);

  const paintRef = useRef<PaintCanvasHandle | null>(null);
  const mapPanelRef = useRef<HolidayMapPanelHandle | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const quoteIdRef = useRef(initialId ?? "");
  const quoteCreationRef = useRef<Promise<string> | null>(null);
  const quoteRouteReplacedRef = useRef(Boolean(initialId));
  const lastGeocodedKey = useRef("");
  const geocodeSeq = useRef(0);

  const loadQuote = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/holiday-lighting/quotes/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load quote");
      const q = data.quote as QuoteRecord;
      quoteIdRef.current = q.id;
      quoteRouteReplacedRef.current = true;
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
      const nextCatalog = (data.catalog as HolidayLightingCatalog | undefined) ?? DEFAULT_HOLIDAY_CATALOG;
      setCatalog(nextCatalog);
      const parsedMeasurements = parseHolidayMeasurements(q.measurements);
      const parsedSelections = applyHolidayCatalogPolicy(
        parseHolidaySelections(q.selections),
        nextCatalog
      );
      const nextOptions = holidayDesignOptionsFromQuote({
        measurements: parsedMeasurements,
        selections: parsedSelections,
        catalog: nextCatalog,
      });
      const firstOption = nextOptions.find((option) => option.id === parsedSelections.activeDesignOptionId) ?? nextOptions[0]!;
      setDesignOptions(nextOptions);
      setActiveOptionId(firstOption.id);
      setMeasurements(firstOption.measurements);
      setSelections({ ...firstOption.selections, designOptions: nextOptions, activeDesignOptionId: firstOption.id });
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
        const nextSelections = holidaySelectionsFromCatalog(nextCatalog);
        const initialOption = holidayDesignOptionsFromQuote({
          measurements: EMPTY_HOLIDAY_MEASUREMENTS,
          selections: nextSelections,
          catalog: nextCatalog,
        });
        setCatalog(nextCatalog);
        setSelections({ ...nextSelections, designOptions: initialOption, activeDesignOptionId: initialOption[0]!.id });
        setDesignOptions(initialOption);
        setActiveOptionId(initialOption[0]!.id);
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
    if (quoteIdRef.current) return quoteIdRef.current;
    if (quoteCreationRef.current) return quoteCreationRef.current;

    const creation = (async () => {
      const res = await fetch("/api/holiday-lighting/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customerId || null,
          propertyId: propertyId || null,
          visitId: initialVisitId || null,
          address,
          city,
          state,
          zip,
          lat: center?.lat ?? null,
          lng: center?.lng ?? null,
          measurements,
          selections: selectionsWithCurrentOption(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create quote");
      const createdId = data.quote.id as string;
      quoteIdRef.current = createdId;
      return createdId;
    })();

    quoteCreationRef.current = creation;
    try {
      return await creation;
    } finally {
      quoteCreationRef.current = null;
    }
  }

  function currentOptions(
    nextMeasurements = measurements,
    nextSelections = selections,
    optionId = activeOptionId,
    baseOptions = designOptions
  ): HolidayQuoteDesignOption[] {
    const base = baseOptions.length
      ? baseOptions
      : holidayDesignOptionsFromQuote({ measurements, selections, catalog });
    return base.map((option) => option.id === optionId
      ? {
          ...option,
          measurements: nextMeasurements,
          selections: {
            defaultLightStyleKey: nextSelections.defaultLightStyleKey,
            installKind: nextSelections.installKind,
            billingMode: nextSelections.billingMode ?? "standard",
            pricingMode: nextSelections.pricingMode ?? "buy",
            defaultColorPattern: nextSelections.defaultColorPattern,
            notes: nextSelections.notes,
            optionAdjustments: nextSelections.optionAdjustments,
            reinstallPrice: nextSelections.reinstallPrice,
          },
        }
      : option);
  }

  function selectionsWithCurrentOption(
    nextMeasurements = measurements,
    nextSelections = selections
  ): HolidayQuoteSelections {
    return {
      ...nextSelections,
      designOptions: currentOptions(nextMeasurements, nextSelections),
      activeDesignOptionId: activeOptionId,
    };
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
    opts?: {
      quiet?: boolean;
      designOptions?: HolidayQuoteDesignOption[];
      activeOptionId?: string;
    }
  ) {
    setSaving(true);
    try {
      const id = await ensureQuote();
      const nextMeasurements = patch?.measurements ?? measurements;
      const nextSelections = patch?.selections ?? selections;
      const nextOptions = currentOptions(
        nextMeasurements,
        nextSelections,
        opts?.activeOptionId ?? activeOptionId,
        opts?.designOptions ?? designOptions
      );
      setDesignOptions(nextOptions);
      const targetOptionId = opts?.activeOptionId ?? activeOptionId;
      const body = {
        address,
        city,
        state,
        zip,
        lat: center?.lat ?? null,
        lng: center?.lng ?? null,
        customerId: customerId || null,
        measurements: nextMeasurements,
        selections: { ...nextSelections, designOptions: nextOptions, activeDesignOptionId: targetOptionId },
        ...patch,
      };
      body.measurements = nextMeasurements;
      body.selections = { ...nextSelections, designOptions: nextOptions, activeDesignOptionId: targetOptionId };
      const res = await fetch(`/api/holiday-lighting/quotes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      if (data.pricing) setPricing(data.pricing);
      if (!quoteRouteReplacedRef.current) {
        quoteRouteReplacedRef.current = true;
        router.replace(`/holiday-lighting/quote/${id}`);
      }
      if (!opts?.quiet) toast.success("Quote saved");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function patchOption(key: HolidayQuoteOptionKey, patch: Partial<HolidayOptionAdjustment>) {
    setSelections((current) => ({
      ...current,
      optionAdjustments: {
        ...current.optionAdjustments,
        [key]: { ...current.optionAdjustments?.[key], ...patch },
      },
    }));
  }

  function switchDesignOption(optionId: string) {
    if (optionId === activeOptionId) return;
    const snapshot = currentOptions();
    const target = snapshot.find((option) => option.id === optionId);
    if (!target) return;
    setDesignOptions(snapshot);
    setActiveOptionId(target.id);
    setMeasurements(target.measurements);
    setSelections({ ...target.selections, designOptions: snapshot, activeDesignOptionId: target.id });
    setSelectedSegmentId(null);
    setPricing(null);
    void save(
      { measurements: target.measurements, selections: { ...target.selections, designOptions: snapshot, activeDesignOptionId: target.id } },
      { quiet: true, designOptions: snapshot, activeOptionId: target.id }
    );
  }

  function addDesignOption(copyCurrent: boolean) {
    const snapshot = currentOptions();
    if (snapshot.length >= 5) {
      toast.error("Holiday estimates can have up to five options");
      return;
    }
    const number = snapshot.length + 1;
    const id = crypto.randomUUID();
    const baseSelections = copyCurrent
      ? { ...selections, designOptions: undefined }
      : holidaySelectionsFromCatalog(catalog);
    const normalized = applyHolidayCatalogPolicy(baseSelections, catalog);
    const baseMeasurements = copyCurrent
      ? structuredClone(measurements)
      : pruneStrands({
          segments: structuredClone(measurements.segments).map((segment) => ({
            ...segment,
            lightStyleKey: normalized.defaultLightStyleKey,
            colorPattern: normalized.defaultColorPattern ?? "Warm White",
          })),
          placements: [],
          streetTraces: structuredClone(measurements.streetTraces ?? []),
          strands: structuredClone(measurements.strands ?? []).map((strand) => ({
            ...strand,
            lightStyleKey: normalized.defaultLightStyleKey,
          })),
        });
    const nextOption: HolidayQuoteDesignOption = {
      id,
      label: `Option ${number}`,
      measurements: baseMeasurements,
      selections: {
        defaultLightStyleKey: normalized.defaultLightStyleKey,
        installKind: normalized.installKind,
        billingMode: normalized.billingMode ?? "standard",
        pricingMode: normalized.pricingMode ?? "buy",
        defaultColorPattern: normalized.defaultColorPattern,
        notes: normalized.notes,
        optionAdjustments: normalized.optionAdjustments,
        reinstallPrice: normalized.reinstallPrice,
      },
    };
    const nextOptions = [...snapshot, nextOption];
    setDesignOptions(nextOptions);
    setActiveOptionId(id);
    setMeasurements(baseMeasurements);
    setSelections({ ...nextOption.selections, designOptions: nextOptions, activeDesignOptionId: id });
    setSelectedSegmentId(null);
    setPricing(null);
    void save(
      { measurements: baseMeasurements, selections: { ...nextOption.selections, designOptions: nextOptions, activeDesignOptionId: id } },
      { quiet: true, designOptions: nextOptions, activeOptionId: id }
    );
  }

  function removeActiveDesignOption() {
    const snapshot = currentOptions();
    if (snapshot.length <= 1) return;
    const activeIndex = snapshot.findIndex((option) => option.id === activeOptionId);
    const remaining = snapshot
      .filter((option) => option.id !== activeOptionId)
      .map((option, index) => ({ ...option, label: `Option ${index + 1}` }));
    const target = remaining[Math.min(Math.max(activeIndex, 0), remaining.length - 1)]!;
    setDesignOptions(remaining);
    setActiveOptionId(target.id);
    setMeasurements(target.measurements);
    setSelections({ ...target.selections, designOptions: remaining, activeDesignOptionId: target.id });
    setSelectedSegmentId(null);
    setPricing(null);
    void save(
      { measurements: target.measurements, selections: { ...target.selections, designOptions: remaining, activeDesignOptionId: target.id } },
      { quiet: true, designOptions: remaining, activeOptionId: target.id }
    );
  }

  function updateActiveDesignOptionLabel(label: string) {
    const nextOptions = currentOptions().map((option) =>
      option.id === activeOptionId ? { ...option, label } : option
    );
    setDesignOptions(nextOptions);
    setSelections((current) => ({ ...current, designOptions: nextOptions }));
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
  }, linkPatch?: { customerId?: string | null; propertyId?: string | null }) {
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
          ...linkPatch,
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
      }, { customerId: customer.id });
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
      if (!(await save(undefined, { quiet: true }))) return;
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

  function updateMeasurementsAndSelection(next: HolidayMeasurements) {
    updateMeasurements(next);
  }

  function addPlacement(kind: "tree" | "bush") {
    const count = measurements.placements.filter((item) => item.kind === kind).length + 1;
    const anchor = center ?? measurements.segments[0]?.path[0] ?? { lat: 0, lng: 0 };
    updateMeasurementsAndSelection({
      ...measurements,
      placements: [
        ...measurements.placements,
        {
          id: crypto.randomUUID(),
          kind,
          size: "medium",
          difficulty: 1,
          label: `${kind === "tree" ? "Tree" : "Bush"} ${count}`,
          latLng: anchor,
          lightStyleKey: selections.defaultLightStyleKey === "permanent" ? "c9" : selections.defaultLightStyleKey,
          colorPattern: selections.defaultColorPattern ?? "Warm White",
        },
      ],
    });
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
      const uploadBytes = exported.cleanBlob.size + exported.markedBlob.size;
      if (uploadBytes > 4 * 1024 * 1024) {
        throw new Error("This photo is too large to process. Try a smaller photo.");
      }
      const form = new FormData();
      form.set("clean", exported.cleanBlob, "property.jpg");
      form.set("marked", exported.markedBlob, "property-marked.jpg");
      form.set("lightStyle", selections.defaultLightStyleKey);
      form.set("colorPattern", selections.defaultColorPattern ?? "Warm White");
      const res = await fetch(`/api/holiday-lighting/quotes/${id}/visualize`, {
        method: "POST",
        body: form,
      });
      const responseText = await res.text();
      let data: { error?: string; previewImageUrl?: string } = {};
      if (responseText.trim()) {
        try {
          data = JSON.parse(responseText) as typeof data;
        } catch {
          if (!res.ok) {
            throw new Error(
              res.status === 413 || /request ent/i.test(responseText)
                ? "The preview image was too large to upload. Try again with a smaller photo."
                : responseText.slice(0, 180)
            );
          }
          throw new Error("The preview service returned an invalid response. Please try again.");
        }
      }
      if (!res.ok) throw new Error(data.error ?? "Preview failed");
      if (!data.previewImageUrl) throw new Error("Preview completed without an image URL");
      setPreviewUrl(data.previewImageUrl);
      toast.success("Lighting preview ready");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setVisualizing(false);
    }
  }

  async function createEstimate(mode: "revise" | "new" = "new") {
    setCreating(true);
    setEstimateChoiceOpen(false);
    try {
      const id = await ensureQuote();
      if (!(await save(undefined, { quiet: true }))) return;
      const res = await fetch(`/api/holiday-lighting/quotes/${id}/create-estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create estimate");
      setEstimate({
        id: data.estimate.id,
        estimateNumber: data.estimate.estimateNumber,
        status: data.estimate.status,
      });
      toast.success(mode === "revise" ? "Estimate revised" : "Estimate created");
      setSendDialogOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create estimate failed");
    } finally {
      setCreating(false);
    }
  }

  async function clearQuoteWork() {
    const resetSelections = holidaySelectionsFromCatalog(catalog);
    const resetOptions = holidayDesignOptionsFromQuote({
      measurements: EMPTY_HOLIDAY_MEASUREMENTS,
      selections: resetSelections,
      catalog,
    });
    setMeasurements(EMPTY_HOLIDAY_MEASUREMENTS);
    setSelections({ ...resetSelections, designOptions: resetOptions, activeDesignOptionId: resetOptions[0]!.id });
    setDesignOptions(resetOptions);
    setActiveOptionId(resetOptions[0]!.id);
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
        selections: { ...resetSelections, designOptions: resetOptions, activeDesignOptionId: resetOptions[0]!.id },
        sourcePhotoUrl: null,
        previewImageUrl: null,
      },
      { quiet: true, designOptions: resetOptions, activeOptionId: resetOptions[0]!.id }
    );
    toast.success("Quote measurements cleared");
  }

  const draftPricing = pricing ? {
    buy: optionDetail(pricing.optionDetails.buy.calculated, selections, "buy"),
    lease: optionDetail(pricing.optionDetails.lease.calculated, selections, "lease"),
    permanent: optionDetail(pricing.optionDetails.permanent.calculated, selections, "permanent"),
    labor: optionDetail(pricing.optionDetails.labor.calculated, selections, "labor"),
  } : null;
  const draftReinstall = selections.reinstallPrice ?? pricing?.calculatedReinstallTotal ?? 0;
  const selectedStyle = catalog.lightStyles.find((item) => item.key === selections.defaultLightStyleKey);
  const permanentSelected = selectedStyle?.kind === "permanent";
  const activePricingKey: HolidayQuoteOptionKey = permanentSelected
    ? "permanent"
    : selections.pricingMode === "lease" || selections.pricingMode === "labor"
      ? selections.pricingMode
      : "buy";
  const activePricingLabel = activePricingKey === "permanent"
    ? "Permanent Lights"
    : activePricingKey === "labor"
      ? "Labor Only"
      : activePricingKey === "lease"
        ? "Lease Lights"
        : "Lights + Labor";
  const visibleQuoteOptions: Array<readonly [HolidayQuoteOptionKey, string]> = [
    [activePricingKey, activePricingLabel],
  ];
  const renderedDesignOptions = designOptions.length
    ? currentOptions()
    : holidayDesignOptionsFromQuote({ measurements, selections, catalog });
  const activeDesignOption = renderedDesignOptions.find((option) => option.id === activeOptionId)
    ?? renderedDesignOptions[0];

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

      <div className="rounded-lg border border-border bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          {renderedDesignOptions.map((option) => (
            <Button
              key={option.id}
              type="button"
              size="sm"
              variant={option.id === activeOptionId ? "default" : "outline"}
              onClick={() => switchDesignOption(option.id)}
            >
              {option.label}
            </Button>
          ))}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={renderedDesignOptions.length >= 5}
                className="gap-1"
              >
                + New Option
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuItem className="items-start py-2" onSelect={() => addDesignOption(false)}>
                <div>
                  <p className="font-medium">Create new option</p>
                  <p className="text-xs text-muted-foreground">
                    Keep the roofline measurements and start fresh with lights, scope, trees, and bushes.
                  </p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem className="items-start py-2" onSelect={() => addDesignOption(true)}>
                <div>
                  <p className="font-medium">Copy current option</p>
                  <p className="text-xs text-muted-foreground">
                    Duplicate the roofline, selections, trees, bushes, and pricing.
                  </p>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {renderedDesignOptions.length > 1 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={removeActiveDesignOption}
            >
              Remove current
            </Button>
          ) : null}
          <span className="text-xs text-muted-foreground">Up to 5 options per estimate</span>
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
          defaultColorPattern={selections.defaultColorPattern}
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
          <h3 className="text-sm font-semibold">Lighting selections</h3>
          <div className="space-y-3 rounded-md border border-border p-3">
            <label className="block text-xs text-muted-foreground">Option title
              <input
                type="text"
                maxLength={80}
                value={activeDesignOption?.label ?? ""}
                placeholder="Option title"
                onChange={(event) => updateActiveDesignOptionLabel(event.target.value)}
                onBlur={() => void save(undefined, {
                  quiet: true,
                  designOptions: currentOptions(),
                  activeOptionId,
                })}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="block text-xs text-muted-foreground">Customer-facing description / notes
              <textarea
                rows={3}
                maxLength={1000}
                value={selections.notes ?? ""}
                placeholder="Add details that should appear with this option on the estimate"
                onChange={(event) => setSelections((current) => ({ ...current, notes: event.target.value }))}
                onBlur={() => void save(undefined, { quiet: true })}
                className="mt-1 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-muted-foreground">Scope
              <select
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={permanentSelected ? "buy" : activePricingKey}
                disabled={permanentSelected}
                onChange={(event) => {
                  const pricingMode = event.target.value === "lease"
                    ? "lease" as const
                    : event.target.value === "labor"
                      ? "labor" as const
                      : "buy" as const;
                  const next = {
                    ...selections,
                    pricingMode,
                    billingMode: pricingMode === "labor" ? "labor_only" as const : "standard" as const,
                  };
                  setSelections(next);
                  void save({ selections: next }, { quiet: true });
                }}
              >
                <option value="buy">Materials + labor</option>
                <option value="lease">Lease</option>
                <option value="labor">Labor only</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground">Light type
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selections.defaultLightStyleKey}
              onChange={(e) => {
                const next = applyHolidayCatalogPolicy(
                  { ...selections, defaultLightStyleKey: e.target.value },
                  catalog
                );
                const nextMeasurements = {
                  ...measurements,
                  segments: measurements.segments.map((segment) => ({
                    ...segment,
                    lightStyleKey: e.target.value,
                  })),
                };
                setSelections(next);
                setMeasurements(pruneStrands(nextMeasurements));
                void save({ selections: next, measurements: nextMeasurements }, { quiet: true });
              }}
            >
              {catalog.lightStyles.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            </label>
            {catalog.lightStyles.find((style) => style.key === selections.defaultLightStyleKey)?.kind !== "permanent" ? (
              <label className="text-xs text-muted-foreground">Color / pattern
                <select
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={HOLIDAY_COLOR_PATTERNS.includes((selections.defaultColorPattern ?? "Warm White") as typeof HOLIDAY_COLOR_PATTERNS[number]) ? selections.defaultColorPattern : "Other"}
                  onChange={(event) => {
                    const colorPattern = event.target.value;
                    const nextSelections = { ...selections, defaultColorPattern: colorPattern };
                    const nextMeasurements = { ...measurements, segments: measurements.segments.map((segment) => ({ ...segment, colorPattern })) };
                    setSelections(nextSelections);
                    setMeasurements(pruneStrands(nextMeasurements));
                    void save({ selections: nextSelections, measurements: nextMeasurements }, { quiet: true });
                  }}
                >
                  {HOLIDAY_COLOR_PATTERNS.map((color) => <option key={color} value={color}>{color}</option>)}
                </select>
              </label>
            ) : null}
          </div>
          {catalog.lightStyles.find((style) => style.key === selections.defaultLightStyleKey)?.kind !== "permanent" &&
          (!HOLIDAY_COLOR_PATTERNS.includes((selections.defaultColorPattern ?? "Warm White") as typeof HOLIDAY_COLOR_PATTERNS[number]) || selections.defaultColorPattern === "Other") ? (
            <label className="block text-xs text-muted-foreground">Custom color / pattern
              <input
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selections.defaultColorPattern === "Other" ? "" : selections.defaultColorPattern ?? ""}
                placeholder="Describe the color or alternating pattern"
                onChange={(event) => {
                  const colorPattern = event.target.value || "Other";
                  const nextSelections = { ...selections, defaultColorPattern: colorPattern };
                  const nextMeasurements = { ...measurements, segments: measurements.segments.map((segment) => ({ ...segment, colorPattern })) };
                  setSelections(nextSelections);
                  setMeasurements(pruneStrands(nextMeasurements));
                  void save({ selections: nextSelections, measurements: nextMeasurements }, { quiet: true });
                }}
              />
            </label>
          ) : null}
          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold">Trees and bushes</h4>
                <p className="text-xs text-muted-foreground">Difficulty is internal and is not shown to the customer.</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => addPlacement("tree")}>Add tree</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => addPlacement("bush")}>Add bush</Button>
              </div>
            </div>
            {measurements.placements.map((placement) => (
              <div key={placement.id} className="space-y-2 rounded-md border border-border p-3">
                <div className="flex items-center gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-md border border-input px-2 py-1.5 text-sm"
                    value={placement.label}
                    onChange={(event) => updateMeasurementsAndSelection({ ...measurements, placements: measurements.placements.map((item) => item.id === placement.id ? { ...item, label: event.target.value } : item) })}
                  />
                  <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => updateMeasurementsAndSelection({ ...measurements, placements: measurements.placements.filter((item) => item.id !== placement.id) })}>Remove</Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-4">
                  <label className="text-xs text-muted-foreground">Size
                    <select className="mt-1 w-full rounded-md border border-input px-2 py-1.5 text-sm" value={placement.size} onChange={(event) => updateMeasurementsAndSelection({ ...measurements, placements: measurements.placements.map((item) => item.id === placement.id ? { ...item, size: event.target.value as HolidayTreeSize } : item) })}>
                      <option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option>
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">Difficulty
                    <select className="mt-1 w-full rounded-md border border-input px-2 py-1.5 text-sm" value={placement.difficulty ?? 1} onChange={(event) => updateMeasurementsAndSelection({ ...measurements, placements: measurements.placements.map((item) => item.id === placement.id ? { ...item, difficulty: Number(event.target.value) as HolidayDifficulty } : item) })}>
                      <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">Bulb type
                    <select className="mt-1 w-full rounded-md border border-input px-2 py-1.5 text-sm" value={placement.lightStyleKey ?? "c9"} onChange={(event) => updateMeasurementsAndSelection({ ...measurements, placements: measurements.placements.map((item) => item.id === placement.id ? { ...item, lightStyleKey: event.target.value } : item) })}>
                      {catalog.lightStyles.filter((item) => item.kind !== "permanent").map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">Color / pattern
                    <input className="mt-1 w-full rounded-md border border-input px-2 py-1.5 text-sm" list="holiday-color-patterns" value={placement.colorPattern ?? "Warm White"} onChange={(event) => updateMeasurementsAndSelection({ ...measurements, placements: measurements.placements.map((item) => item.id === placement.id ? { ...item, colorPattern: event.target.value } : item) })} />
                  </label>
                </div>
              </div>
            ))}
            <datalist id="holiday-color-patterns">{HOLIDAY_COLOR_PATTERNS.filter((color) => color !== "Other").map((color) => <option key={color} value={color} />)}</datalist>
          </div>
          {pricing ? (
            <div className="space-y-2 rounded-md bg-muted/40 p-3 text-sm">
              <div>
                <div className="flex justify-between">
                  <span>{activePricingLabel}</span>
                  <span className="font-semibold">{money(pricing.optionDetails[activePricingKey].total)}</span>
                </div>
                {activePricingKey === "buy" ? (
                  <p className="text-xs text-muted-foreground">Future years: {money(pricing.reinstallTotal)}</p>
                ) : null}
                {activePricingKey === "labor" ? (
                  <p className="text-xs text-muted-foreground">Customer-supplied lights and materials</p>
                ) : null}
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
          {pricing && draftPricing ? (
            <section className="space-y-4 rounded-lg border border-border bg-background p-4">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {renderedDesignOptions.map((option) => (
                  <Button
                    key={option.id}
                    type="button"
                    size="sm"
                    variant={option.id === activeOptionId ? "default" : "outline"}
                    className="shrink-0"
                    onClick={() => switchDesignOption(option.id)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              <div>
                <h3 className="text-sm font-semibold">Prices and discounts</h3>
                <p className="text-xs text-muted-foreground">Leave a price blank to use the calculated price. Discounts apply to each option separately.</p>
              </div>
              {visibleQuoteOptions.map(([key, label]) => {
                const adjustment = selections.optionAdjustments?.[key];
                const detail = draftPricing[key];
                return <div key={key} className="space-y-2 rounded-md border border-border p-3">
                  <div className="flex items-center justify-between text-sm font-medium"><span>{label}</span><span>{money(detail.total)}</span></div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <label className="text-xs text-muted-foreground">Price ($)
                      <input type="number" min={0} max={9999999} step="0.01" placeholder={detail.calculated.toFixed(2)}
                        value={adjustment?.price ?? ""}
                        onChange={(event) => patchOption(key, { price: event.target.value === "" ? null : Number(event.target.value) })}
                        className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground" />
                    </label>
                    <label className="text-xs text-muted-foreground">Discount
                      <select value={adjustment?.discountType ?? "fixed"}
                        onChange={(event) => patchOption(key, { discountType: event.target.value === "percent" ? "percent" : "fixed" })}
                        className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground">
                        <option value="fixed">Amount ($)</option><option value="percent">Percent (%)</option>
                      </select>
                    </label>
                    <label className="text-xs text-muted-foreground">Amount
                      <input type="number" min={0} max={adjustment?.discountType === "percent" ? 100 : 9999999} step="0.01"
                        value={adjustment?.discountAmount ?? 0}
                        onChange={(event) => patchOption(key, { discountAmount: Number(event.target.value) || 0 })}
                        className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground" />
                    </label>
                    <label className="text-xs text-muted-foreground">Discount name
                      <input type="text" maxLength={80} placeholder="Holiday discount"
                        value={adjustment?.discountLabel ?? ""}
                        onChange={(event) => patchOption(key, { discountLabel: event.target.value })}
                        className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground" />
                    </label>
                  </div>
                  {detail.discountTotal > 0 ? <p className="text-xs text-muted-foreground">{money(detail.subtotal)} minus {money(detail.discountTotal)} discount</p> : null}
                </div>;
              })}
              {activePricingKey === "buy" ? <label className="block text-xs text-muted-foreground">Future years ($)
                <input type="number" min={0} max={9999999} step="0.01" placeholder={pricing.calculatedReinstallTotal.toFixed(2)}
                  value={selections.reinstallPrice ?? ""}
                  onChange={(event) => setSelections((current) => ({ ...current, reinstallPrice: event.target.value === "" ? null : Number(event.target.value) }))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground" />
              </label> : null}
              <Button type="button" variant="outline" disabled={saving} onClick={() => void save()}>Save prices and discounts</Button>
            </section>
          ) : null}
          <section className="space-y-3 rounded-lg border border-border bg-white p-4">
            <h3 className="text-sm font-semibold">Quote</h3>
            {pricing ? (
              <div className="space-y-3 text-sm">
                <div>
                  <div className="flex justify-between">
                    <span>{activePricingLabel}</span>
                    <span className="font-semibold">{money(draftPricing?.[activePricingKey].total ?? pricing.optionDetails[activePricingKey].total)}</span>
                  </div>
                  {activePricingKey === "buy" ? <p className="text-xs text-muted-foreground">
                    New customer-owned lights and materials, installation, and take-down. Future
                    years: {money(draftReinstall)}. Includes bulb replacements during the season.
                  </p> : null}
                  {activePricingKey === "lease" ? <p className="text-xs text-muted-foreground">
                    No commitments. Includes installation, take-down, and bulb replacements during
                    the season.
                  </p> : null}
                  {activePricingKey === "labor" ? <p className="text-xs text-muted-foreground">
                    Installation and take-down labor for customer-supplied lights. Lights, bulbs,
                    clips, extension cords, and other materials are not included.
                  </p> : null}
                  {activePricingKey === "permanent" ? <p className="text-xs text-muted-foreground">
                    Fit your vibe year-round. Highest up-front cost, then change colors with an
                    app for teams, causes, and holidays — not just Christmas.
                  </p> : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {Math.round(pricing.billedLengthFt)} ft billed
                  {pricing.placementCount
                    ? ` · ${pricing.placementCount} trees/bushes`
                    : ""}
                  {(activePricingKey === "buy" || activePricingKey === "labor") && pricing.year1MinimumApplied
                    ? " · new-option first-year minimum applied"
                    : ""}
                </p>
                {activePricingKey === "lease" && pricing.optionDetails.lease.calculated <= 0 && selections.optionAdjustments?.lease?.price == null ? (
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
              onClick={() => estimate ? setEstimateChoiceOpen(true) : void createEstimate("new")}
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
      {estimateChoiceOpen ? (
        <ModalPortal>
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-black/50"
              aria-label="Close estimate choice"
              disabled={creating}
              onClick={() => setEstimateChoiceOpen(false)}
            />
            <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-white p-5 shadow-lg">
              <h2 className="text-base font-semibold">Update the branded estimate?</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Revise {estimate?.estimateNumber ?? "the existing estimate"} in place, or create a separate estimate with a new number.
              </p>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <Button type="button" variant="ghost" disabled={creating} onClick={() => setEstimateChoiceOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" variant="outline" disabled={creating} onClick={() => void createEstimate("new")}>
                  Create new estimate
                </Button>
                <Button type="button" disabled={creating} onClick={() => void createEstimate("revise")}>
                  Revise existing
                </Button>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
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
