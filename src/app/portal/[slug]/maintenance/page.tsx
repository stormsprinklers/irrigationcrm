import { PortalMaintenanceView } from "@/components/portal/PortalMaintenanceView";
import { getCompanyByPortalSlug } from "@/lib/portal/company";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ slug: string }> };

export default async function PortalMaintenancePage({ params }: Props) {
  const { slug } = await params;
  if (!(await getCompanyByPortalSlug(slug))) notFound();
  return <PortalMaintenanceView slug={slug} />;
}
