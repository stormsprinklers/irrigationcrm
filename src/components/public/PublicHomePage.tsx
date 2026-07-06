import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PublicHomePageFooter } from "@/components/public/PublicHomePageFooter";
import { stormBrand } from "@/lib/branding";

const FEATURES = [
  {
    title: "Customers & scheduling",
    description:
      "Manage leads, jobs, visits, estimates, and invoices for your irrigation business in one place.",
  },
  {
    title: "Marketing & SEO",
    description:
      "Track organic rankings, Search Console performance, Google Business Profile metrics, and paid ad campaigns.",
  },
  {
    title: "Team operations",
    description:
      "Dispatch technicians, run checklists, handle inbox calls and messages, and review reporting dashboards.",
  },
] as const;

export function PublicHomePage() {
  return (
    <div className="min-h-screen bg-page text-foreground">
      <header className="border-b border-storm-ice/60 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Image
              src={stormBrand.logoPath}
              alt="Storm Sprinklers"
              width={160}
              height={48}
              className="h-10 w-auto object-contain"
              priority
            />
            <div>
              <p className="font-display text-lg font-semibold text-storm-navy">Irrigation CRM</p>
              <p className="text-xs text-muted-foreground">by Storm Sprinklers</p>
            </div>
          </div>
          <Button asChild>
            <Link href="/login">Staff sign in</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <section className="mb-12 space-y-4">
          <h1 className="font-display text-4xl font-bold tracking-tight text-storm-navy sm:text-5xl">
            Irrigation CRM
          </h1>
          <p className="max-w-3xl text-lg leading-relaxed text-muted-foreground">
            Irrigation CRM is the internal business operations platform used by Storm Sprinklers to
            run our irrigation company. It helps our staff manage customers, schedule field work,
            send estimates and invoices, and monitor marketing performance — including integrations
            with Google services our team connects voluntarily.
          </p>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            This application is not a public consumer product. Access is limited to authorized
            Storm Sprinklers employees and contractors who sign in with company credentials.
          </p>
        </section>

        <section className="mb-12 grid gap-4 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="rounded-lg border border-storm-ice/60 bg-white p-5">
              <h2 className="mb-2 text-base font-semibold text-storm-navy">{feature.title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
            </article>
          ))}
        </section>

        <section className="mb-12 rounded-lg border border-storm-ice/60 bg-white p-6">
          <h2 className="mb-3 text-lg font-semibold text-storm-navy">Google integrations</h2>
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
            When an administrator connects a Google account, Irrigation CRM uses OAuth to read
            business data for internal reporting only. We do not sell or share Google user data with
            third parties.
          </p>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">Google Ads</strong> — campaign spend, impressions,
              clicks, and conversions for our PPC dashboard.
            </li>
            <li>
              <strong className="text-foreground">Google Search Console</strong> — search queries,
              impressions, clicks, and sitemap status for SEO reporting.
            </li>
            <li>
              <strong className="text-foreground">Google Business Profile</strong> — local listing
              performance such as calls, direction requests, and profile impressions.
            </li>
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            Admins can disconnect any integration at any time, which removes stored OAuth tokens.
            See our{" "}
            <Link href="/privacy" className="text-primary underline">
              Privacy Policy
            </Link>{" "}
            for details.
          </p>
        </section>

        <section className="rounded-lg border border-storm-ice/60 bg-storm-navy px-6 py-8 text-white">
          <h2 className="mb-2 text-lg font-semibold">Authorized access only</h2>
          <p className="mb-4 max-w-2xl text-sm leading-relaxed text-storm-ice">
            If you are a Storm Sprinklers team member, sign in to open your dashboard. Customers
            should use the customer portal link provided by our office, not this page.
          </p>
          <Button asChild variant="secondary">
            <Link href="/login">Sign in to Irrigation CRM</Link>
          </Button>
        </section>
      </main>

      <PublicHomePageFooter />
    </div>
  );
}
