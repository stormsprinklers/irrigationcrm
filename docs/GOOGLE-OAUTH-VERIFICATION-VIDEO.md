# Google OAuth app verification — YouTube video plan

Use this script when submitting your OAuth verification request. Record a **single unlisted YouTube video** that demonstrates **all scopes** used by your one OAuth Web client in Google Cloud.

**Public homepage (Google branding verification):** `https://crm.stormsprinklers.com/`

- App name on the page: **Irrigation CRM** (must match OAuth consent screen)
- No login required to view `/` or `/privacy`
- Verify domain ownership of `crm.stormsprinklers.com` in [Google Search Console](https://search.google.com/search-console) (URL-prefix property) or add the `GOOGLE_SITE_VERIFICATION` meta tag from Search Console to Vercel env and redeploy

**Preview page for recording:** open your CRM at:

```
/marketing/google-oauth-demo
```

That page shows sample dashboards for GBP, Search Console, and Google Ads without requiring live API data.

---

## Scopes & redirect URIs (this OAuth client)

| Scope | Product | Redirect URI | CRM screens |
|-------|---------|--------------|-------------|
| `https://www.googleapis.com/auth/business.manage` | Google Business Profile | `…/api/marketing/google-business/callback` | Settings → Google Business Profile; Marketing → Google Business Profile |
| `https://www.googleapis.com/auth/webmasters.readonly` | Google Search Console | `…/api/marketing/search-console/callback` | Marketing → SEO |
| `https://www.googleapis.com/auth/adwords` | Google Ads API (PPC + Local Services Ads) | `…/api/marketing/google-ads/callback` | Settings → Google Ads; Marketing → Ads |

**Also required for Google Ads (not OAuth):**

- Enable **Google Ads API** on the same Google Cloud project
- Set **`GOOGLE_ADS_DEVELOPER_TOKEN`** on the server (Vercel) — apply for Basic/Standard access in Google Ads → Tools → API Center if you have not already
- GBP may use the same OAuth client or a separate **`GOOGLE_BUSINESS_OAUTH_*`** client — if separate, show both clients in the video and explain each scope

**Note:** Google Ads has no read-only OAuth scope. We request `adwords` so our team can **read** PPC and Local Services campaign performance in the CRM dashboard today and **manage** campaigns and LSA budgets/leads as those features roll out. We do not access other businesses’ accounts.

---

## Before you record

1. Log into the CRM as an admin.
2. Have Google Cloud Console open (OAuth consent screen + Credentials) to show the **same OAuth client(s)** used for all redirect URIs above.
3. Optional: connect GBP, Search Console, and/or Google Ads live if already verified — otherwise use the preview page for those sections.
4. App name on consent screen should match the public homepage: **Irrigation CRM**.
5. Video length target: **6–9 minutes** (three scopes + OAuth client setup).

---

## Video outline (recommended order)

### 1. Introduction (30–45 sec)

**Say:**

> This video demonstrates how Storm Sprinklers CRM uses Google OAuth scopes for our internal marketing dashboard. We use one OAuth 2.0 Web client with three redirect URIs for Google Business Profile, Search Console, and Google Ads. The app is used only by our business staff to view and manage our own Google marketing data—local profile performance, organic search analytics, Google PPC campaigns, and Local Services Ads. We request read-only access where Google offers it. Google Ads uses the adwords scope because no read-only alternative exists; we use it only for our connected account. We do not sell or share this data. Website traffic and conversions are tracked natively in the CRM and do not require Google Analytics OAuth.

**Show:**

- CRM login screen → Marketing section
- Brief mention: `stormsprinklers.com` is our company website
- Marketing → SEO → **Website analytics** (native tracking, no Google OAuth)
- Marketing → **Ads** (Google PPC + Google LSA tabs)

---

### 2. OAuth client & redirect URIs (45–60 sec)

**Show in Google Cloud Console:**

- **APIs & Services → Credentials → OAuth 2.0 Client IDs** (your Web client)
- **Authorized redirect URIs** — all three must be visible:
  - `…/api/marketing/google-business/callback`
  - `…/api/marketing/search-console/callback`
  - `…/api/marketing/google-ads/callback`
- **OAuth consent screen → Scopes** — show all three scopes listed
- **APIs & Services → Enabled APIs** — show **Google Ads API** and **Search Console API** enabled (GBP APIs if on same project)

**Say:**

> All three integrations share this OAuth client. Each integration requests only the scope it needs when the user clicks Connect in Settings or Marketing. Google Ads also requires a developer token on our server; that token is not shared with users or other companies.

---

### 3. Google Business Profile — `business.manage` (1–1.5 min)

**Show:**

- Navigate to **Marketing → Google Business Profile**
- Click **Connect Google Business Profile** (or show connected state)
- Google OAuth consent screen → scope includes Business Profile management
- After connect: location picker, performance metrics (impressions, calls, website clicks, directions)

**Or use preview page section:** “Google Business Profile preview”

**Say:**

> We need business.manage to read performance metrics for our connected GBP location—impressions, call clicks, website clicks, and direction requests—so our team can track local visibility alongside our website SEO. We do not use this scope to modify listings on behalf of other businesses; only the authenticated owner connects their account.

**Why not a more limited scope:**

> There is no narrower scope that provides Business Profile Performance API access for dashboard reporting.

---

### 4. Google Search Console — `webmasters.readonly` (1–1.5 min)

**Show:**

- **Marketing → SEO** → Search Console panel
- Connect flow OR connected dashboard: clicks, impressions, CTR, average position, top queries, top landing pages, sitemaps
- **Website analytics** panel on the same page (page views, UTMs, phone clicks, form submits)

**Or use preview page section:** “Google Search Console preview”

**Say:**

> webmasters.readonly lets us call the Search Console API to display search queries, impressions, clicks, and sitemap status for properties the user owns. This helps us understand which keywords drive discovery on Google Search. On-site conversions come from our native website tracking on the same SEO page—not from Google Analytics OAuth.

**Why read-only:**

> We never submit sitemaps or change settings from the CRM—display only. The readonly scope matches that use case.

---

### 5. Google Ads — `adwords` (PPC + Local Services Ads) (1.5–2 min)

**Show:**

- **Settings → Integrations → Google Ads** → **Connect Google Ads**
- Google OAuth consent screen → scope includes Google Ads (`adwords`)
- After connect: pick the **Google Ads customer account** (and MCC / login customer if applicable)
- **Marketing → Ads** → **Google PPC** tab: spend, impressions, clicks, CPC, conversions, ROAS, campaign table (Search, Display, Performance Max, etc.)
- **Marketing → Ads** → **Google LSA** tab — explain Local Services Ads reporting uses the same Google Ads API connection for `LOCAL_SERVICES` campaigns and lead metrics

**Or use preview page section:** “Google Ads preview (PPC + LSA)”

**Say:**

> We need the adwords scope to call the Google Ads API for our connected account. Our marketing team uses this to monitor Google PPC—search, display, and remarketing—and Local Services Ads pay-per-lead campaigns in one dashboard alongside Meta ads. Today the CRM loads campaign performance and spend; LSA lead and budget management is rolling out on the same integration. Only an authenticated admin connects our company’s Google Ads account. We do not manage ads for other businesses.

**Why not a more limited scope:**

> Google does not offer a read-only OAuth scope for the Google Ads API. We request adwords only when an admin explicitly connects Google Ads, store the refresh token server-side, and use the developer token only on our backend.

**If Google asks about developer token:**

> Basic or Standard API access is approved in Google Ads → Tools → API Center. The token is stored in our server environment variables and sent only in server-to-server Google Ads API requests.

---

### 6. OAuth flow & security (45–60 sec)

**Show on preview page:** “OAuth flow (all integrations)” cards + “Data handling summary”

**Say:**

> When an admin connects an integration, we use the authorization code flow with offline access, store a refresh token server-side, and call Google APIs only when loading the dashboard or performing user-initiated ads actions. Disconnect deletes the token. Access is limited to logged-in CRM admins for our single company account.

---

### 7. Closing (15–30 sec)

**Say:**

> In summary, we use one OAuth Web client with three scopes to power an internal marketing dashboard for Storm Sprinklers: business.manage for local profile performance, webmasters.readonly for search analytics, and adwords for Google PPC and Local Services Ads. Website behavior and conversions are tracked first-party in the CRM. Search Console access is read-only; Google Ads uses the full adwords scope because Google requires it, but access is limited to our own account and initiated only by our staff. Thank you.

---

## Submission checklist (Google form)

- [ ] YouTube link is **unlisted** or **public** (not private)
- [ ] Video shows **all three scopes** (`business.manage`, `webmasters.readonly`, `adwords`) and the **same OAuth client ID**
- [ ] Video shows **all three redirect URIs** on the OAuth client (or explains separate GBP client if used)
- [ ] Video shows the **OAuth consent screen** for at least one connect flow (ideally Google Ads if that is the scope under review)
- [ ] Video shows **Google Ads API** enabled in Cloud Console and **Marketing → Ads** / **Settings → Google Ads** after connect
- [ ] **Google Ads developer token** applied for (Basic/Standard) if submitting Ads API access
- [ ] App privacy policy URL (if required) mentions Google user data handling
- [ ] Test users removed / app published when moving to production

---

## Talking points if Google asks follow-ups

| Question | Answer |
|----------|--------|
| Who uses the app? | Internal staff of Storm Sprinklers (single business CRM) |
| Is data shared? | No — displayed only to authenticated admins of that company |
| Can users disconnect? | Yes — Disconnect removes refresh tokens |
| Why offline access? | To refresh dashboards without re-authenticating on every page load |
| Do you write to Google APIs? | Search Console: read-only. GBP: manage scope but CRM reads performance metrics only today. Google Ads: adwords scope; CRM reads campaign metrics today; PPC and LSA budget/lead management is user-initiated for our account only |
| Why adwords scope? | No read-only Google Ads OAuth scope exists; required for PPC reporting and Local Services Ads via Google Ads API |
| Google Ads developer token? | Server-only env var; used with OAuth access tokens for Google Ads API calls; not exposed to browsers or other tenants |
| What about Analytics? | We do not use Google Analytics OAuth. Website metrics are first-party. Optional GA4 via GTM is for the GA4 UI only, not CRM. |

---

## URLs to show on screen

| Item | Path |
|------|------|
| Verification preview | `/marketing/google-oauth-demo` |
| Live SEO + GSC + Website analytics | `/marketing/seo` |
| Live GBP | `/marketing/google-business` |
| Live Google PPC + LSA dashboard | `/marketing/ads` |
| Google Ads connect (Settings) | `/settings/integrations/google-ads` |
| GBP connect (Settings) | `/settings/integrations/google-business` |
| GSC OAuth start | `/api/marketing/search-console` |
| GBP OAuth start | `/api/marketing/google-business` |
| Google Ads OAuth start | `/api/marketing/google-ads` |

---

## Property IDs (Storm Sprinklers)

- GTM Container: `GTM-K3H6GZJX`
- Website: `https://www.stormsprinklers.com`

Optional (GTM → GA4 UI only, not CRM OAuth):

- GA4 Measurement ID: `G-7ZFJ52TXXN`
- GA4 Property ID: `381923905`
