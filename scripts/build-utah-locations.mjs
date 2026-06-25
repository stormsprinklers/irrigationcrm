import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const sourcePath = path.join(root, "locations.json");
const outputPath = path.join(__dirname, "../src/lib/local-seo/data/utah-locations.json");

const INCLUDED_TARGET_TYPES = new Set(["City", "Postal Code"]);

if (!fs.existsSync(sourcePath)) {
  console.error(`Missing ${sourcePath}`);
  process.exit(1);
}

const locations = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

function sortUtahLocations(a, b) {
  if (a.target_type !== b.target_type) {
    if (a.target_type === "City") return -1;
    if (b.target_type === "City") return 1;
    return a.target_type.localeCompare(b.target_type);
  }

  if (a.target_type === "Postal Code") {
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  }

  return a.name.localeCompare(b.name);
}

const utahLocations = locations
  .filter(
    (location) =>
      location.country_code === "US" &&
      INCLUDED_TARGET_TYPES.has(location.target_type) &&
      typeof location.canonical_name === "string" &&
      location.canonical_name.endsWith(",Utah,United States") &&
      Array.isArray(location.gps) &&
      location.gps.length === 2
  )
  .map((location) => ({
    id: location.id,
    google_id: location.google_id ?? undefined,
    google_parent_id: location.google_parent_id ?? undefined,
    name: location.name,
    canonical_name: location.canonical_name,
    country_code: location.country_code,
    target_type: location.target_type,
    reach: location.reach ?? undefined,
    gps: location.gps,
  }))
  .sort(sortUtahLocations);

const cityCount = utahLocations.filter((location) => location.target_type === "City").length;
const postalCodeCount = utahLocations.filter(
  (location) => location.target_type === "Postal Code"
).length;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(utahLocations, null, 2)}\n`);

console.log(
  `Wrote ${utahLocations.length} Utah locations (${cityCount} cities, ${postalCodeCount} postal codes) to ${outputPath}`
);
