# ASVS / API / MASVS Evidence Matrix

This is a scoped evidence index, not a certification checklist. “Partial” means source evidence exists but runtime/configuration evidence remains outstanding.

| Control family | Status | Current evidence | Exception / next evidence |
|---|---|---|---|
| ASVS V1 architecture | Partial | Threat model, trust boundaries, route inventory | Confirm deployed topology, owners, and data flows. |
| ASVS V2 authentication | Partial | Server-derived sessions, token version, distributed auth limits | Staging lifecycle, recovery, enumeration, revocation tests. |
| ASVS V3 session management | Partial | Secure Auth.js flow and legacy-token invalidation | Cookie/runtime inspection, expiry/revocation/concurrency tests. |
| ASVS V4 access control | Partial | Tenant evidence scan on all routes; account-switch checks | Full two-tenant/role matrix and object-level tests. |
| ASVS V5 validation | Partial | Zod patterns in app, upload signature checks | Fuzz high-risk inputs and centralize policies. |
| ASVS V6 cryptography | Partial | HMAC/signatures and platform key stores | Secret/key inventory, rotation, algorithm/config review. |
| ASVS V7 errors/logging | Partial | Reduced sideband errors; structured login/MFA/session security events with filtered metadata and daily retention cleanup | Expand to exports, payments/refunds, credentials, and administrative changes; prove retention runtime. |
| ASVS V8 data protection | Partial | Safer blob response headers; iOS protected storage | Data retention/deletion, backup expiry, cache/log inspection. |
| ASVS V9 communications | Partial | HTTPS production warning, HSTS | TLS/domain/provider verification and mobile trust tests. |
| ASVS V10 malicious code | Partial | CI gitleaks/dependency gate | Online results, SBOM/license workflow, artifact provenance. |
| ASVS V11 business logic | Partial | Server-side session actions and payment review plan | Refund, pricing, duplicate/replay, workflow abuse testing. |
| ASVS V12 files/resources | Partial | Count/size/MIME/signature for inbox, safe disposition/CSP, fail-closed scanner at shared blob storage, outbound-fetch controls | Connect scanner; centralize signature/archive/size rules for every upload class; runtime-test SSRF controls. |
| ASVS V13 API/web services | Partial | 551-route manifest; fail-closed trusted endpoints; durable webhook deduplication | Human policy sign-off, schema/body limits, error and cache tests. |
| ASVS V14 configuration | Partial | Security headers, safe seed, CI workflow | Vercel/database/provider evidence and migration deploy. |
| API1 BOLA / API5 BFLA | Open test | Tenant/role classification | Paired two-tenant object/function matrix. |
| API2 authentication | Partial | Session hardening and rate limits | Dynamic token/recovery/replay tests. |
| API3 property authorization | Open test | Typed actions and validation patterns | Mass-assignment/property fuzzing. |
| API4 resource consumption | Partial | Auth limits, upload bounds, sideband quotas | Search/export/webhook/global quota tests. |
| API6 sensitive business flows | Open test | High-priority inventory | Payments, refunds, messages, exports, credential workflows. |
| API7 SSRF | Partial | Central HTTPS-only outbound-fetch policy with private-address DNS checks, redirect validation, credential stripping, host allowlists, and bounded reads | Deployed DNS rebinding/redirect tests and remaining fetch inventory review. |
| API8 misconfiguration | Partial | Headers and fail-closed config | Deployed configuration scan. |
| API9 inventory | Partial | Complete route module inventory | Owner/version/deprecation records for integrations. |
| API10 unsafe API consumption | Partial | Provider signature checks | Response schema, timeout/retry, redirect, and payload-limit review. |
| MASVS STORAGE | Partial | Device-only Keychain and protected offline store | Device inspection; screenshot/cache/log review. |
| MASVS AUTH | Partial | Mobile tokens and server authorization model | Modified-client role/tenant and remote-revocation tests. |
| MASVS NETWORK | Open test | HTTPS endpoint test added | ATS, TLS interception/trust, WebSocket testing. |
| MASVS PLATFORM | Open test | Source inventory | Deep links, push payload, pasteboard, background location. |
| MASVS CODE / RESILIENCE / PRIVACY | Open test | Test target exists | Build hardening, dependency review, tamper behavior, consent/retention. |
