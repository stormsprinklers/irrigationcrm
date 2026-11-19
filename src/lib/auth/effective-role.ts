export function effectiveSessionRole(input: {
  tokenRole: string;
  tokenTrueRole?: string | null;
  currentRole: string;
}) {
  const validAdminPreview =
    input.tokenTrueRole === "ADMIN" && input.currentRole === "ADMIN";
  return validAdminPreview ? input.tokenRole : input.currentRole;
}

export function hasValidAdminPreview(input: {
  tokenTrueRole?: string | null;
  currentRole: string;
}) {
  return input.tokenTrueRole === "ADMIN" && input.currentRole === "ADMIN";
}
