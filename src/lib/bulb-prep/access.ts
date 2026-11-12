export function bulbPrepPathAllowed(pathname: string) {
  if (pathname === "/home") return true;
  if (pathname === "/api/time-clock") return true;
  if (pathname === "/api/bulb-prep" || pathname.startsWith("/api/bulb-prep/")) return true;
  if (pathname === "/api/settings/company/branding") return true;
  return false;
}
