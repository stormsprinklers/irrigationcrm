import utahLocationsData from "@/lib/local-seo/data/utah-locations.json";
import type { SerpApiLocation } from "@/lib/serpapi/types";

export const UTAH_SERP_LOCATIONS = utahLocationsData as SerpApiLocation[];

/** @deprecated Use UTAH_SERP_LOCATIONS */
export const UTAH_CITY_LOCATIONS = UTAH_SERP_LOCATIONS;

export function getUtahLocationStats() {
  const cities = UTAH_SERP_LOCATIONS.filter((location) => location.target_type === "City").length;
  const postalCodes = UTAH_SERP_LOCATIONS.filter(
    (location) => location.target_type === "Postal Code"
  ).length;

  return {
    total: UTAH_SERP_LOCATIONS.length,
    cities,
    postalCodes,
  };
}

export function getUtahCityLocationCount() {
  return getUtahLocationStats().total;
}

export function searchUtahCityLocations(query: string, limit = 50): SerpApiLocation[] {
  return searchUtahLocations(query, limit);
}

export function searchUtahLocations(query: string, limit = 50): SerpApiLocation[] {
  const normalized = query.trim().toLowerCase();

  const matches = normalized
    ? UTAH_SERP_LOCATIONS.filter((location) => {
        const name = location.name.toLowerCase();
        const canonical = location.canonical_name.toLowerCase();
        const typeLabel =
          location.target_type === "Postal Code" ? "zip postal code" : "city";

        return (
          name.includes(normalized) ||
          canonical.includes(normalized) ||
          (normalized === "zip" && location.target_type === "Postal Code") ||
          (normalized === "postal" && location.target_type === "Postal Code") ||
          typeLabel.includes(normalized)
        );
      })
    : UTAH_SERP_LOCATIONS;

  return matches.slice(0, limit);
}

export function formatUtahLocationLabel(location: SerpApiLocation) {
  if (location.target_type === "Postal Code") {
    return `ZIP ${location.name}`;
  }
  return location.name;
}
