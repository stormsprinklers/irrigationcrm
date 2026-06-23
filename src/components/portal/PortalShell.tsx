"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, FileText, Home, LogOut, MapPin, Percent, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Features = {
  jobs: boolean;
  invoices: boolean;
  estimates: boolean;
  maintenance: boolean;
  checklists: boolean;
  rachio: boolean;
  offers: boolean;
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

  const nav = [
    { href: base, label: "Home", icon: Home, show: true },
    { href: `${base}/visits`, label: "Visits", icon: Calendar, show: features.jobs },
    { href: `${base}/invoices`, label: "Invoices", icon: FileText, show: features.invoices },
    { href: `${base}/maintenance`, label: "Maintenance", icon: Wrench, show: features.maintenance },
    { href: `${base}/offers`, label: "Offers", icon: Percent, show: features.offers },
  ].filter((n) => n.show);

  async function logout() {
    await fetch("/api/portal/auth/logout", { method: "POST" });
    window.location.href = `${base}/login`;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            {emailLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={emailLogoUrl} alt="" className="h-8 w-auto object-contain" />
            ) : null}
            <div>
              <p className="text-xs text-muted-foreground">Customer portal</p>
              <p className="font-semibold">{companyName}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void logout()}>
            <LogOut className="mr-1 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-6">
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
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm",
                  active ? "bg-primary text-primary-foreground" : "bg-white border border-border hover:bg-muted"
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
      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
    >
      <MapPin className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}
