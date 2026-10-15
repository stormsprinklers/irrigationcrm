# Prioritized Security Remediation Backlog

## Before release

| Priority | Work item | Acceptance evidence |
|---|---|---|
| P0 | Execute two-tenant authorization/session retest for CRM-SEC-001 | All role/audience permutations deny cross-tenant and unauthorized actions; legacy JWT is rejected. |
| P0 | Execute callback/job fail-closed and replay tests | Missing/invalid auth always fails; duplicate financial/message events cause one side effect. |
| P0 | Prove staging communications containment | Canary reconciliation shows only allowlisted recipients across application, providers, and egress. |
| P0 | Complete public invoice/estimate token protection at rest | Expiry/rotation/revocation are implemented; choose encrypted retrievability or signed derived tokens and verify no plaintext capability appears in storage/log evidence. |
| P0 | Confirm Stripe-hosted card-data boundary | Redacted network/data-store evidence and PCI owner sign-off. |
| P1 | Replace schema push with reviewed Prisma migration deploy | Versioned migration, backup, staging rollout, rollback/restore proof. |
| P1 | Connect malware scanning and finish uniform upload validation | Shared blob storage now enforces the scanner; connect the provider and add consistent signature/archive/size policies plus malicious-file tests for every upload class. |
| P1 | Runtime-test durable OAuth state nonce consumption | Source now binds state to tenant/provider and consumes it once; attach replay/concurrency test evidence. |
| P1 | Browser-test CSP and move compatible routes to nonces/hashes | No required flow breaks; violation report triage; unnecessary sources removed. |
| P1 | Run iOS MASVS test set on physical/simulated devices | Test output and redacted device inspection attached. |
| P1 | Runtime-test centralized CSRF/origin policy | Source guard is implemented; cross-site JSON, form, and multipart tests must fail while same-origin and independently authenticated exemptions work. |
| P1 | Runtime-test centralized outbound-fetch policy | Source guard is implemented across high-risk variable fetches; prove DNS/redirect/private-address behavior and required provider/CDN compatibility in staging. |

## Next 30 days

| Priority | Work item | Acceptance evidence |
|---|---|---|
| P2 | Introduce a declarative route-policy wrapper | Audience, methods, roles, tenant/object rule, rate limit, audit event declared for all 551 routes; CI blocks omissions. |
| P2 | Expand structured security audit coverage | Login/MFA and account/role switch events are implemented; add export, refund/payment, credential, and admin actions plus request IDs. |
| P2 | Add edge abuse controls for marketing tracking if needed | Signed expiring tokens are implemented; validate traffic patterns and preserve privacy-safe unsubscribe behavior. |
| P2 | Connect rate-limit/security-event operational metrics | Daily lifecycle cleanup is implemented; alerting must cover spikes, storage errors, and lockout patterns. |
| P2 | Complete AI tool authorization and prompt-injection test corpus | Tools use ordinary request context, least privilege, explicit confirmation, and tenant-safe retrieval. |
| P2 | Resolve the 13 lint warnings and fail CI on new warnings | Clean baseline with `--max-warnings=0`. |

## Ongoing

- Critical: notify owner immediately; fix within 24 hours.
- High: fix within 7 days or before release.
- Medium: fix within 30 days.
- Low: fix within 90 days.
- Retest every Critical/High and representative Medium. Risk acceptance never closes a finding silently and must expire.
