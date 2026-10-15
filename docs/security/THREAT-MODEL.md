# CRM Threat Model

## Assets

- Customer and employee identity, contact, address, precise location, schedules, and service history.
- Call audio, voicemail, transcripts, email/SMS bodies, photos, and uploaded documents.
- Estimates, invoices, refunds, expense-card data, and Stripe identifiers/metadata.
- Password hashes, MFA challenges, sessions, mobile access/refresh tokens, OAuth tokens, integration keys, webhook secrets, APNs credentials, and AI capability tokens.
- Tenant configuration, pricing, marketing audiences, analytics, and operational logs.

## Actors and trust boundaries

Actors are anonymous users, portal customers, staff roles (Admin, Manager, CSR, Sales, Technician, Installer, Social Media Manager), mobile clients, integration clients, scheduled jobs, third-party webhook senders, and the AI sideband. Every transition between browser/mobile/provider/sideband, Vercel, PostgreSQL, blob storage, and provider API is a trust boundary.

## Priority abuse cases

| Threat | Entry points | Security objective and test |
|---|---|---|
| Tenant breakout / BOLA | IDs in staff, portal, mobile, integration, blob, invoice, estimate, and location APIs | Derive tenant from authenticated context; pair records in tenants A/B and attempt read/write/delete/export from the wrong context. |
| Privilege escalation | Session update, role preview, account switching, modified mobile requests | Claims are server-derived; target account is reloaded and linked; real/effective roles cannot exceed server policy. |
| Account takeover | Login, MFA, reset, magic links, refresh/logout | Distributed throttles, uniform responses, single-use expirations, session rotation/revocation, recovery logging, and no OTP leakage. |
| Payment/refund fraud | Invoice/estimate links, checkout, Stripe callbacks, refunds, expense cards | Signed provider events, idempotency, tenant ownership, amount/currency computed server-side, privileged refunds, complete audit trail. |
| Telephony/messaging abuse | SMS/email/voice sends, inbound callbacks, AI streams | Provider signatures, allowlists/test mode, shared limits, opt-out enforcement, bounded payloads, no arbitrary recipient bypass. |
| Malicious files | Inbox, portal, employee photos, attachments, generated documents | Size/count/type/signature enforcement, private paths, malware scan, safe disposition, `nosniff`, tenant-authorized download. |
| SSRF / redirect abuse | URL imports, OAuth redirects, marketing click tracking, AI tools | HTTPS allowlist, DNS/IP revalidation, redirect limits, blocked private/link-local ranges, signed redirect targets. |
| Webhook replay | Stripe, Twilio, SendGrid, Meta, jobs | Mandatory secret, timestamp window, event-ID deduplication, transactionally idempotent handler. |
| Prompt/tool injection | AI receptionist and Storm AI context/tools | Treat transcripts/content as data, minimize tools, bind tenant, validate arguments, confirm destructive actions, cap cost/time. |
| Lost device / offline disclosure | iOS Keychain, SwiftData, caches, notifications, screenshots | Device-only Keychain, protected files, remote revocation, minimal push payloads, privacy overlay, retention and wipe behavior. |
| Resource exhaustion | Auth, search/export, uploads, webhooks, WebSocket, AI | Per-IP/identity/tenant/credential quotas, payload/time limits, pagination, concurrency limits, cost alerts. |

## Security invariants

1. A request cannot choose its authoritative tenant or role.
2. Every object lookup is tenant-scoped before an action is authorized.
3. Trusted callbacks and jobs fail closed when configuration is missing.
4. A replay cannot repeat a financial, communication, or destructive side effect.
5. Staging cannot contact an unapproved recipient even if an application-level freeze is bypassed.
6. Public capability links are purpose-bound, expiring, revocable, and never logged in plaintext.
7. AI content cannot enlarge tool authority; all tool requests pass ordinary authorization.
8. Cardholder data never enters CRM requests, storage, logs, analytics, or support artifacts.

## Required test identities

Create two synthetic tenants with every staff role, one portal customer each, paired resources with recognizable non-production IDs, one integration key per type, mobile access/refresh tokens, expired/revoked credentials, and public links in valid/expired/revoked states. Do not use copied production records.
