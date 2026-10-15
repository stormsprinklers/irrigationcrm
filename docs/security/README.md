# CRM Security Package

- `SECURITY-ASSESSMENT-2026-10-14.md` — executive brief, scope, findings, evidence, and release decision.
- `THREAT-MODEL.md` — assets, boundaries, abuse cases, invariants, and required test identities.
- `route-security-manifest.csv` / `.json` — generated classification of all 551 API route modules.
- `CONTROL-EVIDENCE-MATRIX.md` — ASVS/API/MASVS evidence and exceptions.
- `PCI-SCOPE.md` — payment data-flow hypothesis and verification procedure.
- `STAGING-SECURITY-RUNBOOK.md` — synthetic-only containment and active-test sequence.
- `PROCESS-CONTROLS.md` — cloud, database, provider, access, incident, and SDLC evidence checklist.
- `REMEDIATION-BACKLOG.md` — prioritized release and 30-day work.
- `RETEST-REPORT.md` — completed local checks and pending runtime evidence.

Regenerate the route manifest with `npm run security:routes`; CI checks it with `npm run security:routes -- --check`.
