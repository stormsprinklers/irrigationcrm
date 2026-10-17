import type { Metadata } from "next";
import Link from "next/link";
import { PublicHomePageFooter } from "@/components/public/PublicHomePageFooter";

export const metadata: Metadata = {
  title: "Privacy Policy — Radar CRM",
  description: "How Storm Sprinklers handles data in Radar CRM, including Google OAuth integrations.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-page">
      <header className="border-b border-storm-ice/60 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="font-display text-lg font-semibold text-storm-navy">Radar CRM</p>
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
            <strong className="text-foreground">Last updated:</strong> October 2026
          </p>
          <p>
            Storm Sprinklers LLC (&quot;Storm Sprinklers,&quot; &quot;we,&quot; or &quot;us&quot;)
            operates Radar CRM at{" "}
            <a href="https://crm.stormsprinklers.com" className="text-primary underline">
              crm.stormsprinklers.com
            </a>
            . This policy describes how we handle information in that application.
          </p>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">Who uses this app</h2>
            <p>
              Radar CRM is private software for authorized Storm Sprinklers staff and
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
            <h2 className="text-lg font-semibold text-foreground">Radar on iPhone and iPad</h2>
            <p>
              The mobile app processes staff account information, customer contact and property
              records, visit activity and time records, estimates, messages, and attachments that
              authorized users create or upload. These records are associated with the signed-in
              account and company. Device notification tokens are used to deliver notifications.
            </p>
            <p>
              With location permission, Radar transmits device location for field-service routing,
              job activity and on-my-way tracking. On-my-way tracking ends when stopped or when its
              two-hour limit expires. Camera, photo, microphone and video access are used for the
              features you choose, including job photos, calling and assistant interactions.
            </p>
            <p>
              We use service providers to host records, deliver calls, messages and notifications,
              process payments, provide maps and generate AI previews or assistant responses.
              Photos and instructions submitted for AI generation are sent to the AI provider.
              Calling providers may collect technical call-quality diagnostics. Payment details
              are processed through the payment provider. We do not use Radar staff data for
              advertising tracking or sell it to data brokers.
            </p>
            <p>
              Business records are retained as part of the company CRM. Contact us through the
              support link below to request access, correction or deletion of your information.
              You can change device permissions in iOS Settings; some features require those permissions.
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
              Questions about this policy or Google data in Radar CRM can be sent through{" "}
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
