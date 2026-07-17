/** Client-safe Radar branding helpers (no server imports). */

export const RADAR_APP_NAME = "Radar";

export function radarDocumentTitle(companyName?: string | null): string {
  const name = companyName?.trim();
  return name ? `${RADAR_APP_NAME} - ${name}` : RADAR_APP_NAME;
}
