"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, FileText, Home, LogOut, Percent, Phone, Users, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolvePortalLogoUrl } from "@/lib/portal/branding";
import { cn } from "@/lib/utils";

type Features = {
  jobs: boolean;
  invoices: boolean;
  estimates: boolean;
  maintenance: boolean;
  checklists: boolean;
  irrigation?: boolean;
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
  /** Public estimate links — branding only, no portal nav / sign-out. */
  guest?: boolean;
  children: React.ReactNode;
};

export function PortalShell({
  slug,
  companyName,
  emailLogoUrl,
  features,
  guest = false,
  children,
}: Props) {
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
    { href: `${base}/contact`, label: "Contact", icon: Phone, show: true },
  ].filter((n) => n.show);

  async function logout() {
    await fetch("/api/portal/auth/logout", { method: "POST" });
    window.location.href = `${base}/login`;
  }

  return (
    <div className="portal-shell light min-h-screen bg-[#f1f5f9] text-[#102341]">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.08)]">
        <div className="portal-container flex items-center justify-between gap-4 py-3">
          <Link href={guest ? "#" : base} className="flex shrink-0 items-center" onClick={guest ? (e) => e.preventDefault() : undefined}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={`${companyName} home`}
                className="h-14 w-auto max-w-[220px] object-contain"
              />
            ) : (
              <span className="font-display text-lg uppercase tracking-wide text-[#102341]">{companyName}</span>
            )}
          </Link>
          {!guest ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-[#102341] hover:text-storm-coral"
              onClick={() => void logout()}
            >
              <LogOut className="mr-1 h-4 w-4" />
              Sign out
            </Button>
          ) : null}
        </div>
      </header>

      <div className="portal-container py-6">
        {!guest ? (
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
                      : "border border-[#c2e4f0] bg-white text-[#102341] hover:bg-[#c2e4f0]/60"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
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
