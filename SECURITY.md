# Security Policy

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, customer data, recordings, or screenshots with personal information. Report suspected vulnerabilities privately to the designated security owner for this repository. Include the affected route or component, impact, reproduction steps using synthetic data, and any suggested containment.

## Response targets

- Critical: immediate containment and owner notification; target remediation within 24 hours.
- High: remediate within 7 days or before the next release, whichever is sooner.
- Medium: remediate within 30 days.
- Low: remediate within 90 days.

Risk acceptance must name an owner, document compensating controls, and include an expiry date. Critical and High fixes require a regression test and security retest.

## Testing rules

Active testing is restricted to approved staging environments with synthetic tenants and designated sink recipients. Do not perform denial-of-service testing, social engineering, or tests against third-party infrastructure without written authorization. Production verification must remain passive and read-only unless separately approved.
