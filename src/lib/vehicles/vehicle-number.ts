export const MAX_VEHICLE_NUMBER_LENGTH = 50;

export function normalizeVehicleNumber(value: unknown): string | null {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
  return normalized || null;
}

export function vehicleNumberValidationError(value: unknown): string | null {
  const normalized = normalizeVehicleNumber(value);
  if (normalized && normalized.length > MAX_VEHICLE_NUMBER_LENGTH) {
    return `Vehicle number must be ${MAX_VEHICLE_NUMBER_LENGTH} characters or fewer`;
  }
  return null;
}
