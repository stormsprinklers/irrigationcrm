import { PortalPropertyView } from "@/components/portal/PortalPropertyView";
import { getCompanyByPortalSlug } from "@/lib/portal/company";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ slug: string; id: string }> };

export default async function PortalPropertyPage({ params }: Props) {
  const { slug, id } = await params;
  if (!(await getCompanyByPortalSlug(slug))) notFound();
  return <PortalPropertyView slug={slug} propertyId={id} />;
}
