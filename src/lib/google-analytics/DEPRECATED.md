# Google Analytics 4 CRM integration (deprecated)

**Status:** Deprecated as of March 2026. Do not enable or extend.

## Replacement

Website traffic and conversions are tracked **natively** from `stormsprinklers.com` into the CRM:

- **UI:** Marketing → SEO → **Website analytics**
- **Code:** `src/lib/marketing/website-analytics.ts`
- **Website → CRM:** `website/lib/integrations/crm.ts` + `POST /api/integrations/website/events`

This avoids Google OAuth verification for `analytics.readonly`.

## What remains (archived)

- `client.ts`, `types.ts` — kept for reference; not called by live routes
- Prisma fields on `Company`: `googleAnalyticsRefreshToken`, `googleAnalyticsPropertyId`, `googleAnalyticsConnectedAt`
- API routes under `/api/marketing/google-analytics/*` — return HTTP 410

## Optional: GA4 via GTM only

You can still use GA4 in the **Google Analytics UI** via GTM on the website. See `website/lib/analytics/GTM-SETUP.md`. That does not require CRM OAuth.

## Re-enabling later

If you pursue `analytics.readonly` verification in the future, restore route handlers from git history and reconnect `GoogleAnalyticsPanel` on the SEO page.
