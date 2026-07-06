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

That page shows sample dashboards for GBP and Search Console without requiring live API data.

---

## Before you record

1. Log into the CRM as an admin.
2. Have Google Cloud Console open (OAuth consent screen + Credentials) to show the **same OAuth client** used for both redirect URIs.
3. Optional: connect GBP and/or Search Console live if already verified — otherwise use the preview page for those sections.
4. App name on consent screen should match the public homepage: **Irrigation CRM**.
5. Video length target: **4–6 minutes**.

---

## Video outline (recommended order)

### 1. Introduction (30–45 sec)

**Say:**

> This video demonstrates how Storm Sprinklers CRM uses Google OAuth scopes for our internal marketing dashboard. We use one OAuth 2.0 Web client with two redirect URIs. The app is used only by our business staff to view our own Google Business Profile and Search Console data. We request read-only access where possible and do not sell or share this data. Website traffic and conversions are tracked natively in the CRM and do not require Google Analytics OAuth.

**Show:**

- CRM login screen → Marketing section
- Brief mention: `stormsprinklers.com` is our company website
- Marketing → SEO → **Website analytics** (native tracking, no Google OAuth)

---

### 2. OAuth client & redirect URIs (45–60 sec)

**Show in Google Cloud Console:**

- **APIs & Services → Credentials → OAuth 2.0 Client IDs** (your Web client)
- **Authorized redirect URIs** — both must be visible:
  - `…/api/marketing/google-business/callback`
  - `…/api/marketing/search-console/callback`
- **OAuth consent screen → Scopes** — show both scopes listed

**Say:**

> Both integrations share this single OAuth client. Each integration requests only the scope it needs when the user clicks Connect.

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

### 5. OAuth flow & security (45–60 sec)

**Show on preview page:** “OAuth flow (all integrations)” cards + “Data handling summary”

**Say:**

> When an admin connects an integration, we use the authorization code flow with offline access, store a refresh token server-side, and call Google APIs only when loading the dashboard. Disconnect deletes the token. Access is limited to logged-in CRM admins for our single company account.

---

### 6. Closing (15–30 sec)

**Say:**

> In summary, we use one OAuth Web client with two scopes to power an internal marketing dashboard for Storm Sprinklers. business.manage for local profile performance and webmasters.readonly for search analytics. Website behavior and conversions are tracked first-party in the CRM. All Google access is read-only where available, user-initiated, and used solely to display our own business metrics inside our CRM. Thank you.

---

## Submission checklist (Google form)

- [ ] YouTube link is **unlisted** or **public** (not private)
- [ ] Video shows **both scopes** and the **same OAuth client ID**
- [ ] Video shows the **OAuth consent screen** for at least one connect flow
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
| Do you write to Google APIs? | No for Search Console; GBP scope is manage but we only read performance metrics in current implementation |
| What about Analytics? | We do not use Google Analytics OAuth. Website metrics are first-party. Optional GA4 via GTM is for the GA4 UI only, not CRM. |

---

## URLs to show on screen

| Item | Path |
|------|------|
| Verification preview | `/marketing/google-oauth-demo` |
| Live SEO + GSC + Website analytics | `/marketing/seo` |
| Live GBP | `/marketing/google-business` |
| GSC OAuth start | `/api/marketing/search-console` |
| GBP OAuth start | `/api/marketing/google-business` |

---

## Property IDs (Storm Sprinklers)

- GTM Container: `GTM-K3H6GZJX`
- Website: `https://www.stormsprinklers.com`

Optional (GTM → GA4 UI only, not CRM OAuth):

- GA4 Measurement ID: `G-7ZFJ52TXXN`
- GA4 Property ID: `381923905`
