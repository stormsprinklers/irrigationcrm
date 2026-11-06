export const HOLIDAY_SUBSCRIPTION_AGREEMENT_VERSION = "2026-11-06";

export type HolidaySubscriptionAgreementMaterial = {
  id: string;
  itemDescription: string;
  manufacturerModel: string;
  quantity: number;
  unitMsrp: number;
  totalMsrp: number;
  dateAdded: string;
};

export type HolidaySubscriptionAgreementData = {
  version: string;
  estimateNumber: string;
  selectedOptionId: string;
  customerName: string;
  propertyAddress: string;
  emailPhone: string;
  effectiveDate: string;
  scopeDesignPackage: string;
  targetInstallationWindow: string;
  targetTakedownWindow: string;
  annualSubscriptionFee: number;
  bookingDeposit: number;
  installationPayment: number;
  paymentMethodOnFile: string;
  promotionalPhotoConsent: boolean;
  cancellationFee: number;
  materials: HolidaySubscriptionAgreementMaterial[];
};

type AgreementLineItem = {
  optionId?: string | null;
  name: string;
  unit?: string | null;
  total?: number;
};

type AgreementOptionMetadata = {
  cancellationFee?: unknown;
  cancellationItems?: unknown;
};

function money(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : 0;
}

function quantity(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 1000) / 1000 : 1;
}

function displayDate(value: Date | string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function fullAddress(input: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}, fallback?: string | null) {
  const address = [input.address, input.city, input.state, input.zip]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
  return address || fallback?.trim() || "Property address on estimate";
}

function scopeSummary(lineItems: AgreementLineItem[], selectedOptionId: string, optionLabel: string) {
  const names = lineItems
    .filter((item) => !item.optionId || item.optionId === selectedOptionId)
    .filter((item) => item.unit !== "included" && money(item.total) > 0)
    .map((item) => item.name.trim())
    .filter(Boolean)
    .filter((name, index, values) => values.indexOf(name) === index);
  return names.length ? names.join(", ") : optionLabel.trim() || "Seasonal holiday lighting package";
}

function materialsFromMetadata(
  metadata: AgreementOptionMetadata | null | undefined,
  cancellationFee: number,
  dateAdded: string
) {
  const raw = Array.isArray(metadata?.cancellationItems) ? metadata.cancellationItems : [];
  const materials = raw.slice(0, 100).flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const value = item as Record<string, unknown>;
    const itemDescription = typeof value.name === "string" ? value.name.trim() : "";
    if (!itemDescription) return [];
    const itemQuantity = quantity(value.quantity);
    const unitMsrp = money(value.unitMsrp);
    const totalMsrp = money(value.total ?? itemQuantity * unitMsrp);
    return [{
      id: typeof value.id === "string" && value.id.trim() ? value.id : `material-${index + 1}`,
      itemDescription,
      manufacturerModel:
        typeof value.manufacturerModel === "string" ? value.manufacturerModel.trim() : "",
      quantity: itemQuantity,
      unitMsrp,
      totalMsrp,
      dateAdded,
    }];
  });

  if (materials.length || cancellationFee <= 0) return materials;
  return [{
    id: "legacy-materials",
    itemDescription: "Installed seasonal holiday lighting materials",
    manufacturerModel: "",
    quantity: 1,
    unitMsrp: cancellationFee,
    totalMsrp: cancellationFee,
    dateAdded,
  }];
}

export function buildHolidaySubscriptionAgreement(params: {
  estimateNumber?: string | null;
  selectedOptionId: string;
  optionLabel: string;
  optionTotal: number;
  optionMetadata?: AgreementOptionMetadata | null;
  lineItems?: AgreementLineItem[];
  customer?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  } | null;
  property?: {
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  } | null;
  addressFallback?: string | null;
  createdAt?: Date | string | null;
  effectiveAt?: Date | string | null;
  installationAt?: Date | string | null;
  promotionalPhotoConsent?: boolean;
  paymentMethodOnFile?: string | null;
}): HolidaySubscriptionAgreementData {
  const annualSubscriptionFee = money(params.optionTotal);
  const cancellationFee = money(params.optionMetadata?.cancellationFee);
  const dateAdded = displayDate(params.createdAt, "Estimate date");
  const contact = [params.customer?.email?.trim(), params.customer?.phone?.trim()]
    .filter(Boolean)
    .join(" / ");

  return {
    version: HOLIDAY_SUBSCRIPTION_AGREEMENT_VERSION,
    estimateNumber: params.estimateNumber?.trim() || "Estimate",
    selectedOptionId: params.selectedOptionId,
    customerName: params.customer?.name?.trim() || "Customer on estimate",
    propertyAddress: fullAddress(params.property ?? params.customer ?? {}, params.addressFallback),
    emailPhone: contact || "Contact information on estimate",
    effectiveDate: displayDate(params.effectiveAt, "Date accepted at signing"),
    scopeDesignPackage: scopeSummary(
      params.lineItems ?? [],
      params.selectedOptionId,
      params.optionLabel
    ),
    targetInstallationWindow: params.installationAt
      ? displayDate(params.installationAt, "To be scheduled")
      : "To be scheduled with Chestnut & Cheer",
    targetTakedownWindow: "Approximately January 15, subject to scheduling, weather, and safety",
    annualSubscriptionFee,
    bookingDeposit: money(annualSubscriptionFee * 0.5),
    installationPayment: money(annualSubscriptionFee * 0.5),
    paymentMethodOnFile: params.paymentMethodOnFile?.trim() || "Card required at approval",
    promotionalPhotoConsent: params.promotionalPhotoConsent !== false,
    cancellationFee,
    materials: materialsFromMetadata(params.optionMetadata, cancellationFee, dateAdded),
  };
}

export function isSeasonalHolidaySubscriptionOption(optionMetadata: unknown) {
  if (!optionMetadata || typeof optionMetadata !== "object" || Array.isArray(optionMetadata)) {
    return false;
  }
  const value = optionMetadata as Record<string, unknown>;
  return value.pricingMode !== "permanent" && value.recurringYearlyService !== false;
}

