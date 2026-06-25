import type { SerpApiLocation } from "@/lib/serpapi/types";

/** Sample Utah cities in SerpAPI location format for search stub and demos. */
export const UTAH_SAMPLE_LOCATIONS: SerpApiLocation[] = [
  {
    id: "585069b8ee19ad271e9bac18",
    google_id: 1026920,
    name: "Draper",
    canonical_name: "Draper,Utah,United States",
    country_code: "US",
    target_type: "City",
    reach: 246000,
    gps: [-111.8638226, 40.5246711],
  },
  {
    id: "585069b8ee19ad271e9bac19-sample-sandy",
    name: "Sandy",
    canonical_name: "Sandy,Utah,United States",
    country_code: "US",
    target_type: "City",
    gps: [-111.890771, 40.564978],
  },
  {
    id: "585069b8ee19ad271e9bac1a-sample-lehi",
    name: "Lehi",
    canonical_name: "Lehi,Utah,United States",
    country_code: "US",
    target_type: "City",
    gps: [-111.850766, 40.391617],
  },
  {
    id: "585069b8ee19ad271e9bac1b-sample-orem",
    name: "Orem",
    canonical_name: "Orem,Utah,United States",
    country_code: "US",
    target_type: "City",
    gps: [-111.694649, 40.296898],
  },
  {
    id: "585069b8ee19ad271e9bac1c-sample-provo",
    name: "Provo",
    canonical_name: "Provo,Utah,United States",
    country_code: "US",
    target_type: "City",
    gps: [-111.658534, 40.233844],
  },
  {
    id: "585069b8ee19ad271e9bac1d-sample-af",
    name: "American Fork",
    canonical_name: "American Fork,Utah,United States",
    country_code: "US",
    target_type: "City",
    gps: [-111.797971, 40.376895],
  },
  {
    id: "585069b8ee19ad271e9bac1e-sample-murray",
    name: "Murray",
    canonical_name: "Murray,Utah,United States",
    country_code: "US",
    target_type: "City",
    gps: [-111.887993, 40.666892],
  },
  {
    id: "585069b8ee19ad271e9bac1f-sample-slc",
    name: "Salt Lake City",
    canonical_name: "Salt Lake City,Utah,United States",
    country_code: "US",
    target_type: "City",
    gps: [-111.891047, 40.760779],
  },
];

export function searchSampleLocations(query: string, limit = 8): SerpApiLocation[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  return UTAH_SAMPLE_LOCATIONS.filter(
    (location) =>
      location.name.toLowerCase().includes(normalized) ||
      location.canonical_name.toLowerCase().includes(normalized)
  ).slice(0, limit);
}
