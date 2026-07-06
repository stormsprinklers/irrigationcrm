/** Build `accounts/{id}/locations/{id}` parent path for My Business API v4. */
export function buildGbpLocationParent(accountId: string, locationId: string) {
  const account = accountId.startsWith("accounts/") ? accountId : `accounts/${accountId}`;
  const location = locationId.startsWith("locations/") ? locationId : `locations/${locationId}`;
  return `${account}/${location}`;
}
