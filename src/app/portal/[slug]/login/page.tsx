import { PortalLoginForm } from "@/components/portal/PortalLoginForm";
import { getCompanyByPortalSlug } from "@/lib/portal/company";
import { resolvePortalLogoUrl } from "@/lib/portal/branding";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function PortalLoginPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { error } = await searchParams;
  const company = await getCompanyByPortalSlug(slug);
  if (!company) notFound();
  const logoUrl = resolvePortalLogoUrl(company.emailLogoUrl);

  return (
    <main className="portal-shell min-h-screen bg-[#f8fafc]">
      <header className="border-b border-black/5 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
        <div className="portal-container py-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={company.name} className="h-14 w-auto max-w-[220px] object-contain" />
          ) : (
            <span className="font-display text-lg uppercase tracking-wide text-storm-navy">{company.name}</span>
          )}
        </div>
      </header>
      <div className="portal-container py-12">
        <div className="mx-auto max-w-md">
          <div className="mb-6 text-center">
            <h1 className="font-display text-xl uppercase tracking-wide text-storm-navy">Customer portal</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in with your email</p>
          </div>
          <PortalLoginForm slug={slug} error={error ?? null} />
        </div>
      </div>
    </main>
  );
}
