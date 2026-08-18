/** Office roles that reply to and assign Google reviews from Inbox. */
export function canHandleGbpReviews(role: string | null | undefined) {
  return role === "ADMIN" || role === "MANAGER" || role === "CSR" || role === "SALES";
}
