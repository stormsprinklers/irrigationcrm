import { PortalScheduleVisit } from "@/components/portal/PortalScheduleVisit";
import { getCompanyByPortalSlug } from "@/lib/portal/company";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ slug: string }> };

export default async function PortalSchedulePage({ params }: Props) {
  const { slug } = await params;
  if (!(await getCompanyByPortalSlug(slug))) notFound();
  return <PortalScheduleVisit slug={slug} />;
}
