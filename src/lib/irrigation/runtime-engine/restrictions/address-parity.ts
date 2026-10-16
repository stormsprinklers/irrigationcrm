export type AddressParity = "odd" | "even";

/** Extract the leading street number from a street address line. */
export function parseStreetNumber(address: string | null | undefined): number | null {
  if (!address) return null;
  const match = address.trim().match(/^(\d+)/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
}

export function addressParityFromNumber(streetNumber: number): AddressParity {
  return streetNumber % 2 === 0 ? "even" : "odd";
}

export function addressParityFromAddress(
  address: string | null | undefined
): AddressParity | null {
  const streetNumber = parseStreetNumber(address);
  if (streetNumber == null) return null;
  return addressParityFromNumber(streetNumber);
}
