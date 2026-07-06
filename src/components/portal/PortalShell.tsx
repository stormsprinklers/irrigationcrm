"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, FileText, Home, LogOut, Percent, Users, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolvePortalLogoUrl } from "@/lib/portal/branding";
import { cn } from "@/lib/utils";

type Features = {
  jobs: boolean;
  invoices: boolean;
  estimates: boolean;
  maintenance: boolean;
  checklists: boolean;
  rachio: boolean;
  offers: boolean;
  referrals: boolean;
  allowSchedule: boolean;
};

type Props = {
  slug: string;
  companyName: string;
  emailLogoUrl?: string | null;
  features: Features;
  children: React.ReactNode;
};

export function PortalShell({ slug, companyName, emailLogoUrl, features, children }: Props) {
  const pathname = usePathname();
  const base = `/portal/${slug}`;
  const logoUrl = resolvePortalLogoUrl(emailLogoUrl);

  const nav = [
    { href: base, label: "Home", icon: Home, show: true },
    { href: `${base}/visits`, label: "Visits", icon: Calendar, show: features.jobs },
    { href: `${base}/invoices`, label: "Invoices", icon: FileText, show: features.invoices },
    { href: `${base}/maintenance`, label: "Maintenance", icon: Wrench, show: features.maintenance },
    { href: `${base}/offers`, label: "Offers", icon: Percent, show: features.offers },
    { href: `${base}/referrals`, label: "Referrals", icon: Users, show: features.referrals },
  ].filter((n) => n.show);

  async function logout() {
    await fetch("/api/portal/auth/logout", { method: "POST" });
    window.location.href = `${base}/login`;
  }

  return (
    <div className="portal-shell min-h-screen bg-[#f8fafc]">
      <header className="sticky top-0 z-50 border-b border-black/5 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
        <div className="portal-container flex items-center justify-between gap-4 py-3">
          <Link href={base} className="flex shrink-0 items-center">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={`${companyName} home`}
                className="h-14 w-auto max-w-[220px] object-contain sm:h-16"
              />
            ) : (
              <span className="font-display text-lg uppercase tracking-wide text-storm-navy">{companyName}</span>
            )}
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="text-storm-navy hover:text-storm-coral"
            onClick={() => void logout()}
          >
            <LogOut className="mr-1 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      <div className="portal-container py-6">
        <nav className="mb-6 flex flex-wrap gap-2">
          {nav.map((item) => {
            const active =
              item.href === base ? pathname === base : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded px-3 py-2 text-sm font-semibold transition-colors",
                  active
                    ? "bg-storm-coral text-white"
                    : "border border-storm-ice bg-white text-storm-navy hover:bg-storm-ice/60"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        {children}
      </div>
    </div>
  );
}

export function PortalPropertyLink({ slug, propertyId, label }: { slug: string; propertyId: string; label: string }) {
  return (
    <Link
      href={`/portal/${slug}/properties/${propertyId}`}
      className="text-sm font-medium text-storm-sky hover:text-storm-coral hover:underline"
    >
      {label}
    </Link>
  );
}
