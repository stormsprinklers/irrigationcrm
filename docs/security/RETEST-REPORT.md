# Security Retest Report

Date: 2026-10-14
Scope: source-level remediation verification on Windows; no deployed active testing.

## Completed

| Control | Result | Evidence |
|---|---|---|
| Session update rejects arbitrary claims | Pass (unit/source) | `src/lib/auth-session-action.test.ts`; authoritative reload and JWT version in `src/lib/auth.ts`. |
| Missing/invalid cron secret fails closed | Pass (unit/source) | `src/lib/security/trusted-request.test.ts`; eight cron handlers use shared verifier. |
| Distributed auth/integration limiter compiles | Pass (source/typecheck) | PostgreSQL atomic upsert and schema model; login/MFA/reset/portal/integration call sites. |
| Environment recipient gate | Pass (unit/source) | `src/lib/communications/outbound-guard.test.ts`; low-level email/SMS/call senders invoke it. |
| MIME/signature and malware gate | Pass (unit/source) | `src/lib/inbox/attachments.test.ts`; inbox validation plus required-mode scanning at the shared private-blob boundary. Provider-backed malicious-file retest remains pending. |
| Browser header policy | Pass (unit/source) | `src/lib/security/headers.test.ts`; global Next.js headers. |
| Application unit suite | Pass | 357 tests. |
| TypeScript | Pass | `npm run typecheck`. |
| Route inventory | Pass | 551 routes; committed manifest freshness check. |
| CSRF/origin guard | Pass (unit/source) | Cross-site cookie mutation denied; same-origin and independently authenticated machine routes exempted. |
| OAuth state replay | Pass (source/unit primitives) | Signed tenant/provider-bound nonce, 15-minute expiry, atomic one-time consume. Runtime provider callback retest remains pending. |
| Public document links | Pass (unit/source) | 256-bit token creation, expiry/revocation predicates, automatic resend rotation, authenticated rotate/revoke actions. Plaintext-at-rest decision remains open. |
| Webhook replay controls | Pass (source) | Stripe, Meta, and email events use durable claims, leases, deduplication, body bounds, and retryable failure state. |
| Security audit events | Pass (unit/source) | Login/MFA and account/role transitions record hashed correlation fields and filtered metadata. |
| Outbound-fetch / SSRF policy | Pass (unit/source) | HTTPS-only syntax, exact host allowlists, private IPv4/IPv6 rejection, redirect revalidation, credential stripping, and response limits. |
| AI sideband build | Pass | `npm run build` in `receptionist-sideband`. |
| Lint | Pass with warnings | Zero errors, 13 warnings. |

## Pending external/runtime retest

- Next.js optimized production build in CI/Linux. Two Windows attempts reached bundle emission but failed with filesystem `EPERM` directory-creation errors at different generated route paths; typecheck remained clean. An alternate Turbopack attempt was also constrained by the local filesystem/output path. This is recorded as an environment-limited check, not a passing build.
- Synthetic two-tenant authorization and every staff role.
- Webhook timestamp/replay/concurrency/idempotency behavior with real test providers.
- Authenticated ZAP and manual proxy testing.
- Provider-side recipient restrictions and post-test reconciliation.
- Vercel, PostgreSQL, blob, provider IAM, backups/PITR, restore, retention, and access-review evidence.
- iOS Xcode tests and MASVS device inspection.
- CSP compatibility for Stripe, Google, Maps, Twilio Voice, and blob previews.
- Cross-site JSON/form/multipart CSRF and Origin/Fetch-Metadata enforcement in a real browser/proxy.
- Public capability-token expiry/rotation/revocation against PostgreSQL, including concurrent rotation.
- Malware-scanner provider integration with required-mode malicious-file tests.
- Outbound-fetch DNS rebinding/redirect tests from deployed infrastructure and confirmation of required external hosts.
- Online dependency and full-history secret scan in CI.

## Retest rule

Update this file with build/deployment identifier, tester, date, exact test case, expected/actual result, and redacted evidence location. A source review alone cannot close a finding that depends on deployed configuration or third-party behavior.
