# Google OAuth app verification — YouTube video plan

Use this script when submitting your OAuth verification request. Record a **single unlisted YouTube video** that demonstrates **all scopes** used by your one OAuth Web client in Google Cloud.

**Preview page for recording:** open your CRM at:

```
/marketing/google-oauth-demo
```

That page shows sample dashboards for GBP, Search Console, and GA4 without requiring live API data (useful before `analytics.readonly` is approved).

---

## Before you record

1. Log into the CRM as an admin.
2. Have Google Cloud Console open (OAuth consent screen + Credentials) to show the **same OAuth client** used for all three redirect URIs.
3. Optional: connect GBP and/or Search Console live if already verified — otherwise use the preview page for those sections.
4. App name on consent screen should match what you tell Google (e.g. **Storm Sprinklers CRM**).
5. Video length target: **5–8 minutes**.

---

## Video outline (recommended order)

### 1. Introduction (30–45 sec)

**Say:**

> This video demonstrates how Storm Sprinklers CRM uses Google OAuth scopes for our internal marketing dashboard. We use one OAuth 2.0 Web client with three redirect URIs. The app is used only by our business staff to view our own Google Business Profile, Search Console, and Google Analytics data. We request read-only access where possible and do not sell or share this data.

**Show:**

- CRM login screen → Marketing section
- Brief mention: `stormsprinklers.com` is our company website

---

### 2. OAuth client & redirect URIs (45–60 sec)

**Show in Google Cloud Console:**

- **APIs & Services → Credentials → OAuth 2.0 Client IDs** (your Web client)
- **Authorized redirect URIs** — all three must be visible:
  - `…/api/marketing/google-business/callback`
  - `…/api/marketing/search-console/callback`
  - `…/api/marketing/google-analytics/callback`
- **OAuth consent screen → Scopes** — show all three scopes listed

**Say:**

> All three integrations share this single OAuth client. Each integration requests only the scope it needs when the user clicks Connect.

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

**Or use preview page section:** “Google Search Console preview”

**Say:**

> webmasters.readonly lets us call the Search Console API to display search queries, impressions, clicks, and sitemap status for properties the user owns. This helps us understand which keywords drive discovery on Google Search.

**Why read-only:**

> We never submit sitemaps or change settings from the CRM—display only. The readonly scope matches that use case.

---

### 5. Google Analytics 4 — `analytics.readonly` (2–3 min) ⭐ Main focus

**Show:**

- **Marketing → SEO** → Google Analytics panel **OR** preview page “Google Analytics 4 preview”
- Click **Connect Google Analytics**
- Google consent screen showing **analytics.readonly** (View your Google Analytics data)
- Property picker (lists GA4 properties via Admin API)
- Dashboard after connect:
  - Organic sessions, total sessions, conversions, organic conversions, engagement rate
  - Top pages table (pagePath, page views, sessions)
  - Conversion events (generate_lead, booking_completed, phone_call)

**Say:**

> analytics.readonly is required to read GA4 reports through the Google Analytics Data API and to list properties the user can access via the Admin API. Our website stormsprinklers.com sends events through Google Tag Manager—form submissions, phone calls, and completed bookings. We display those conversion metrics in the CRM next to Search Console data so we can see the full picture: search visibility plus on-site behavior and conversions.

**Why more limited scopes aren’t sufficient:**

> Google does not offer a narrower OAuth scope that still allows runReport for sessions, conversions, and page-level metrics. analytics.readonly is the minimum read-only scope for GA4 reporting APIs. We do not request edit access and we do not modify Analytics configuration from the CRM.

**Show data stays in-app:**

> Data appears only inside this authenticated CRM dashboard for our company. Refresh tokens are stored on our server and can be revoked via Disconnect.

---

### 6. OAuth flow & security (45–60 sec)

**Show on preview page:** “OAuth flow (all integrations)” cards + “Data handling summary”

**Say:**

> When an admin connects an integration, we use the authorization code flow with offline access, store a refresh token server-side, and call Google APIs only when loading the dashboard. Disconnect deletes the token. Access is limited to logged-in CRM admins for our single company account.

---

### 7. Closing (15–30 sec)

**Say:**

> In summary, we use one OAuth Web client with three scopes to power an internal marketing dashboard for Storm Sprinklers. business.manage for local profile performance, webmasters.readonly for search analytics, and analytics.readonly for GA4 sessions and conversions. All access is read-only where available, user-initiated, and used solely to display our own business metrics inside our CRM. Thank you.

---

## Submission checklist (Google form)

- [ ] YouTube link is **unlisted** or **public** (not private)
- [ ] Video shows **all three scopes** and the **same OAuth client ID**
- [ ] Video shows the **OAuth consent screen** for at least one connect flow (ideally GA4)
- [ ] Video explains **why analytics.readonly** is needed and why narrower scopes don’t work
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
| Do you write to Google APIs? | No for Analytics/Search Console; GBP scope is manage but we only read performance metrics in current implementation |

---

## URLs to show on screen

| Item | Path |
|------|------|
| Verification preview | `/marketing/google-oauth-demo` |
| Live SEO + GA + GSC | `/marketing/seo` |
| Live GBP | `/marketing/google-business` |
| GA OAuth start | `/api/marketing/google-analytics` |
| GSC OAuth start | `/api/marketing/search-console` |
| GBP OAuth start | `/api/marketing/google-business` |

---

## Property IDs (Storm Sprinklers)

- GA4 Measurement ID: `G-7ZFJ52TXXN`
- GA4 Property ID: `381923905`
- GTM Container: `GTM-K3H6GZJX`
- Website: `https://www.stormsprinklers.com`
