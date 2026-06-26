import { getGoogleMapsApiKey } from "@/lib/customers/maps";

export type AddressSuggestion = {
  placeId: string;
  label: string;
  mainText: string;
  secondaryText: string;
};

export type ResolvedAddress = {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  formattedAddress: string;
  latitude: number | null;
  longitude: number | null;
};

type AddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

export class AddressAutocompleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AddressAutocompleteError";
  }
}

function normalizePlaceId(id: string): string {
  return id.replace(/^places\//, "");
}

function component(components: AddressComponent[], type: string) {
  return components.find((c) => c.types?.includes(type));
}

export function parseAddressComponents(
  components: AddressComponent[],
  formattedAddress: string
): Omit<ResolvedAddress, "formattedAddress" | "latitude" | "longitude"> {
  const streetNumber = component(components, "street_number")?.longText;
  const route = component(components, "route")?.longText;
  const address =
    [streetNumber, route].filter(Boolean).join(" ").trim() ||
    component(components, "premise")?.longText ||
    formattedAddress.split(",")[0]?.trim() ||
    null;

  const city =
    component(components, "locality")?.longText ??
    component(components, "postal_town")?.longText ??
    component(components, "sublocality")?.longText ??
    component(components, "administrative_area_level_3")?.longText ??
    null;

  const state = component(components, "administrative_area_level_1")?.shortText ?? null;
  const zip = component(components, "postal_code")?.longText ?? null;

  return { address, city, state, zip };
}

export async function searchAddressSuggestions(input: string): Promise<AddressSuggestion[]> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return [];

  const trimmed = input.trim();
  if (trimmed.length < 3) return [];

  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
    },
    body: JSON.stringify({
      input: trimmed,
      includedRegionCodes: ["us"],
      includedPrimaryTypes: ["street_address", "premise", "subpremise", "route"],
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new AddressAutocompleteError(`Address search failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    suggestions?: Array<{
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
      };
    }>;
  };

  return (data.suggestions ?? [])
    .map((suggestion) => {
      const prediction = suggestion.placePrediction;
      const placeId = prediction?.placeId ? normalizePlaceId(prediction.placeId) : "";
      if (!placeId) return null;

      const mainText = prediction?.structuredFormat?.mainText?.text ?? "";
      const secondaryText = prediction?.structuredFormat?.secondaryText?.text ?? "";
      const label = prediction?.text?.text ?? [mainText, secondaryText].filter(Boolean).join(", ");

      return {
        placeId,
        label,
        mainText,
        secondaryText,
      } satisfies AddressSuggestion;
    })
    .filter((item): item is AddressSuggestion => Boolean(item));
}

export async function resolveAddressPlace(placeId: string): Promise<ResolvedAddress> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) throw new AddressAutocompleteError("GOOGLE_MAPS_API_KEY is not configured");

  const id = normalizePlaceId(placeId);
  const res = await fetch(`https://places.googleapis.com/v1/places/${id}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "addressComponents,formattedAddress,location",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new AddressAutocompleteError(`Address lookup failed (${res.status}): ${text}`);
  }

  const place = (await res.json()) as {
    formattedAddress?: string;
    addressComponents?: AddressComponent[];
    location?: { latitude?: number; longitude?: number };
  };

  const formattedAddress = place.formattedAddress ?? "";
  const parsed = parseAddressComponents(place.addressComponents ?? [], formattedAddress);

  return {
    ...parsed,
    formattedAddress,
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
  };
}
