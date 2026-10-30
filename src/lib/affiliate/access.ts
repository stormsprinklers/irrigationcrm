export function affiliatePathAllowed(pathname: string) {
  if (pathname === "/affiliate" || pathname.startsWith("/affiliate/")) return true;
  if (pathname === "/api/affiliate" || pathname.startsWith("/api/affiliate/")) return true;
  return false;
}
