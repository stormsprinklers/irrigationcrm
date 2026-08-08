import { Suspense } from "react";
import { PortalPreferencesView } from "@/components/portal/PortalPreferencesView";
import { getCompanyByPortalSlug } from "@/lib/portal/company";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ slug: string }> };

export default async function PortalPreferencesPage({ params }: Props) {
  const { slug } = await params;
  if (!(await getCompanyByPortalSlug(slug))) notFound();
  return (
    <Suspense fallback={<p className="p-8 text-sm">Loading…</p>}>
      <PortalPreferencesView slug={slug} />
    </Suspense>
  );
}
