import { PortalContactView } from "@/components/portal/PortalContactView";
import { getCompanyByPortalSlug } from "@/lib/portal/company";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ slug: string }> };

export default async function PortalContactPage({ params }: Props) {
  const { slug } = await params;
  if (!(await getCompanyByPortalSlug(slug))) notFound();
  return <PortalContactView slug={slug} />;
}
