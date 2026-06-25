import { NextResponse } from "next/server";

export const GA4_DEPRECATED_MESSAGE =
  "Google Analytics 4 CRM integration is deprecated. Use native Website analytics on Marketing → SEO instead.";

/** @deprecated GA4 OAuth integration test-only / archived. Native website analytics replaced this. */
export function deprecatedGa4JsonResponse(status = 410) {
  return NextResponse.json(
    {
      error: GA4_DEPRECATED_MESSAGE,
      deprecated: true,
      replacement: "/marketing/seo",
    },
    { status }
  );
}
