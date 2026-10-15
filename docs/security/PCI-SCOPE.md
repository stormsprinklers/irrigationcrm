# PCI Data-Flow and Scope Narrative

## Intended boundary

The intended design redirects customers to Stripe-hosted Checkout and stores only Stripe customer/payment/session identifiers, payment state, amounts, currency, invoice linkage, and refund metadata. Under that design, PAN and CVV are entered directly into Stripe-controlled pages and must not pass through CRM servers, databases, logs, analytics, recordings, screenshots, support tickets, or AI prompts.

This document is a technical scope hypothesis, not a PCI DSS certification or SAQ determination. The acquiring bank/QSA/PCI professional must confirm the applicable merchant validation method and connected-account responsibilities.

## Verification procedure

1. Trace every invoice, estimate deposit, subscription, refund, expense-card, manual payment, and mobile/web payment path.
2. Capture browser/mobile network requests in synthetic staging and prove PAN/CVV fields post only to Stripe origins.
3. Search application and provider logs, database columns, blob objects, analytics, error monitoring, call transcripts, and support exports for card-number patterns and security-code labels.
4. Confirm Stripe webhook bodies are bounded, signature-verified using the raw payload, replay-deduplicated, and logged without full payloads.
5. Verify server-side calculation of amount, currency, tenant, customer, and invoice; never trust client metadata for authorization or price.
6. Review Stripe Dashboard access, MFA, restricted keys, webhook secrets, Connect scopes, key rotation, alerting, and test/live separation.
7. Preserve a dated data-flow diagram, evidence, named owner, and annual/change-triggered review.

## Scope expansion triggers

Immediately expand the incident and PCI assessment if PAN/CVV appears in a CRM request, database, log, recording/transcript, AI context, blob, email/SMS, screenshot, or support artifact; if the CRM hosts payment fields outside Stripe Elements/Checkout; or if a third-party integration causes card data to transit CRM infrastructure.

## Current source conclusion

Source indicates a likely Stripe-hosted payment boundary, but runtime traffic and data stores were not available for confirmation. CRM-SEC-015 remains unverified, and release evidence must include the steps above.
