# Security Process and Configuration Evidence

## Evidence checklist

| Control area | Evidence required | Minimum owner/frequency |
|---|---|---|
| Vercel | production/preview separation, deployment roles, SSO/MFA, protected domains, preview authentication, TLS, log access/retention, cron configuration | Platform owner; quarterly and on change |
| PostgreSQL | TLS enforcement, network boundary, least-privilege app role, separate migration role, encryption, backups/PITR, retention, restore evidence, audit access | Data owner; quarterly; restore twice yearly |
| Secrets | inventory, owner, purpose, environment, creation/last-use, rotation/expiry, emergency revoke, dormant credential report | Security owner; quarterly |
| Providers | Stripe/Twilio/SendGrid/APNs/OpenAI/Google/Meta/blob IAM, MFA, scoped keys, test/live separation, webhook config, privacy/retention settings | Integration owner; quarterly |
| Access lifecycle | joiner/mover/leaver tickets, same-day termination, role approval, service accounts, break-glass review | Operations; per event plus quarterly review |
| Incident response | severity model, 24/7 contacts, containment playbooks, breach/legal escalation, provider contacts, evidence handling, tabletop results | Incident commander; annual/tabletop twice yearly |
| Data governance | data map, retention/deletion by class, customer deletion verification, recordings/transcripts/location retention, backup expiry | Privacy owner; annual and on feature change |
| Secure delivery | pull-request review, branch protection, CI gates, dependency/secret alerts, threat-model update, release approval, rollback | Engineering owner; every change |
| Vendor risk | security/privacy terms, subprocessors, data location, breach SLA, deletion, annual review | Business owner; onboarding and annual |
| Training/disclosure | role-based secure development training, phishing awareness, vulnerability reporting channel and response SLA | Security owner; annual |

## Implemented repository controls

- CI typecheck, tests, route-manifest freshness, online high-severity dependency audit, and gitleaks scan.
- `SECURITY.md` with private reporting and response expectations.
- Deterministic route inventory committed for review.
- Production seed refusal, randomized demo credentials, fail-closed trusted callbacks, distributed rate limiting, outbound containment, browser headers, and focused security regression tests.

## Gaps requiring organizational evidence

No repository file can prove actual Vercel access, database recovery, provider IAM, credential rotation, access reviews, incident exercises, retention execution, or vendor contractual controls. A named owner must attach dated evidence; an unchecked box is not a pass. Risk acceptance must include owner, rationale, compensating control, review date, and expiry.
