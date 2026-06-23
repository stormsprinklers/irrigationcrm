import { PortalLoginForm } from "@/components/portal/PortalLoginForm";
import { getCompanyByPortalSlug } from "@/lib/portal/company";
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

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <div className="mb-6 text-center">
        {company.emailLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={company.emailLogoUrl} alt="" className="mx-auto mb-4 h-10 w-auto" />
        ) : null}
        <h1 className="text-2xl font-semibold">{company.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Customer portal sign in</p>
      </div>
      <PortalLoginForm slug={slug} error={error ?? null} />
    </main>
  );
}
