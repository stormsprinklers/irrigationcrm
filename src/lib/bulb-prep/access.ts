export function bulbPrepPathAllowed(pathname: string) {
  if (pathname === "/" || pathname === "/login" || pathname === "/privacy") return true;
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) return true;
  if (pathname === "/home") return true;
  if (pathname === "/api/time-clock") return true;
  if (pathname === "/api/bulb-prep" || pathname.startsWith("/api/bulb-prep/")) return true;
  if (pathname === "/api/settings/company/branding") return true;
  return false;
}
