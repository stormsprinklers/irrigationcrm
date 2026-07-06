import type { Metadata } from "next";
import Link from "next/link";
import { PublicHomePageFooter } from "@/components/public/PublicHomePageFooter";

export const metadata: Metadata = {
  title: "Privacy Policy — Irrigation CRM",
  description: "How Storm Sprinklers handles data in Irrigation CRM, including Google OAuth integrations.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-page">
      <header className="border-b border-storm-ice/60 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="font-display text-lg font-semibold text-storm-navy">Irrigation CRM</p>
            <p className="text-xs text-muted-foreground">Privacy Policy</p>
          </div>
          <Link href="/" className="text-sm text-primary underline">
            Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="mb-6 text-3xl font-semibold text-storm-navy">Privacy Policy</h1>
        <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
          <p>
            <strong className="text-foreground">Last updated:</strong> June 2026
          </p>
          <p>
            Storm Sprinklers LLC (&quot;Storm Sprinklers,&quot; &quot;we,&quot; or &quot;us&quot;)
            operates Irrigation CRM at{" "}
            <a href="https://crm.stormsprinklers.com" className="text-primary underline">
              crm.stormsprinklers.com
            </a>
            . This policy describes how we handle information in that application.
          </p>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">Who uses this app</h2>
            <p>
              Irrigation CRM is private software for authorized Storm Sprinklers staff and
              contractors. It is not offered to the general public as a sign-up service.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">Information we process</h2>
            <p>
              The CRM stores business data needed to operate our company: customer contact details,
              job and visit records, estimates, invoices, employee scheduling, and marketing
              analytics. Access is restricted to authenticated users within our organization.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">Google user data</h2>
            <p>
              Administrators may connect Google accounts through OAuth to display marketing and
              advertising metrics inside the CRM. Depending on the integration, we may access:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Google Ads campaign performance (spend, impressions, clicks, conversions)</li>
              <li>Google Search Console search analytics (queries, clicks, impressions, pages)</li>
              <li>Google Business Profile performance metrics (calls, directions, impressions)</li>
            </ul>
            <p>
              We use this data only to show dashboards to our own team. We do not sell, rent, or
              transfer Google user data to third parties. We do not use Google user data for
              advertising or to build profiles unrelated to operating our business.
            </p>
            <p>
              OAuth refresh tokens are stored securely on our servers. An administrator can
              disconnect an integration at any time, which deletes stored tokens and stops further
              API access.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">Security</h2>
            <p>
              Access requires sign-in. Data is transmitted over HTTPS and stored in secured
              infrastructure used to host the application.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">Contact</h2>
            <p>
              Questions about this policy or Google data in Irrigation CRM can be sent through{" "}
              <a
                href="https://www.stormsprinklers.com/contact"
                className="text-primary underline"
                rel="noopener noreferrer"
              >
                stormsprinklers.com/contact
              </a>
              .
            </p>
          </section>

          <p>
            Our public website privacy policy for consumer visitors is at{" "}
            <a
              href="https://www.stormsprinklers.com/privacy-policy"
              className="text-primary underline"
              rel="noopener noreferrer"
            >
              stormsprinklers.com/privacy-policy
            </a>
            .
          </p>
        </div>
      </main>

      <PublicHomePageFooter />
    </div>
  );
}
