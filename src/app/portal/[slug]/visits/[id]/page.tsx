import { PortalVisitDetail } from "@/components/portal/PortalVisitDetail";
import { getCompanyByPortalSlug } from "@/lib/portal/company";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ slug: string; id: string }> };

export default async function PortalVisitDetailPage({ params }: Props) {
  const { slug, id } = await params;
  if (!(await getCompanyByPortalSlug(slug))) notFound();
  return <PortalVisitDetail slug={slug} visitId={id} />;
}
