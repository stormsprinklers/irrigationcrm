# Synthetic Staging Security Runbook

## Authorization and stop conditions

- Obtain written owner approval naming the staging hostname, source revision, test window, testers, source IPs, and permitted paths.
- Production is passive/read-only unless separately approved. Never run destructive, brute-force, active ZAP, file-payload, or replay tests against production.
- Stop immediately for any real recipient contact, production identifier, cross-environment credential, uncontrolled cost, service instability, or evidence of production data.

## Prepare

1. Create a staging tenant/database from migrations and synthetic seeds only. Run a production-identifier scan and record the result.
2. Snapshot the database and document restore commands, owner, and timestamp.
3. Set `OUTBOUND_COMMS_MODE=allowlist`; allow only designated test email addresses and E.164 phone numbers.
4. Use Stripe test mode, Twilio test credentials/numbers, sink email domain, APNs sandbox, mock Meta/campaign integrations, non-production OAuth apps, isolated blob store, and dedicated OpenAI project/key.
5. Add provider recipient restrictions and an egress/interception control. The application guard is one layer, not the whole containment design.
6. Set long random `AUTH_SECRET`, `MOBILE_JWT_SECRET`, `CRON_SECRET`, callback secrets, `AI_RECEPTIONIST_SECRET`, and `RATE_LIMIT_PEPPER`. Confirm secrets are not present in client bundles or logs.

## Canary and containment proof

Send one approved email, SMS, voice call, push, and Stripe test transaction. Attempt one disallowed recipient for each applicable channel and verify rejection occurs before the provider call. Record application, provider, egress, push, and Stripe event identifiers. Do not include message bodies or secrets in the evidence bundle.

## Test sequence

1. Authentication lifecycle: login, enumeration resistance, MFA verify/resend, reset, magic links, session update, role preview, account switch, refresh, logout, revocation, expiry, and replay.
2. Authorization matrix: for every high-risk resource, test anonymous, all staff roles, mobile, portal, integration, AI, correct tenant, and wrong tenant. Include read, create, update, delete, export, refund, download, and bulk actions.
3. Callbacks/jobs: absent/invalid/valid secret, stale timestamp, duplicate event ID, reordered delivery, concurrent duplicate, oversized body, and handler retry.
4. Injection/content: SQL/NoSQL-style input, template and HTML injection, stored/reflected XSS, redirects, SSRF, path traversal, mass assignment, verbose errors, cache leakage.
5. Uploads: allowed files, MIME spoof, SVG/HTML, polyglot where safe, malformed image/PDF, oversize/count, duplicate name, archive, cross-tenant path, inline rendering, and malware-test fixture approved for the environment.
6. AI: prompt/tool injection, tenant-conflicting content, unauthorized tool arguments, destructive action confirmation, transcript retention, connection/payload/rate/duration ceilings.
7. iOS on a test device: Keychain class, offline file protection/encryption, screenshots/app switcher, logs, push payload, deep links, TLS, uploads, caches, background location, modified-client authorization, and remote logout.
8. Run passive scan first. Run authenticated ZAP/manual proxy only against the allowlisted staging paths and synthetic identities; cap concurrency and request rate.

## Closeout

Reconcile CRM, Twilio, email, APNs, Stripe, OpenAI, egress, and audit logs. Prove zero non-allowlisted recipients and zero production events. Restore or destroy the synthetic environment according to retention policy; revoke all test credentials; securely store redacted evidence and update `RETEST-REPORT.md`.
