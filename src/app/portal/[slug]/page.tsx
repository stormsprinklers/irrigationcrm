import { PortalDashboard } from "@/components/portal/PortalDashboard";
import { getCompanyByPortalSlug } from "@/lib/portal/company";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ slug: string }> };

export default async function PortalHomePage({ params }: Props) {
  const { slug } = await params;
  const company = await getCompanyByPortalSlug(slug);
  if (!company) notFound();
  return <PortalDashboard slug={slug} />;
}
