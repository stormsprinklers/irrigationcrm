import { PortalReferralsPanel } from "@/components/portal/PortalReferralsPanel";
import { getCompanyByPortalSlug } from "@/lib/portal/company";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ slug: string }> };

export default async function PortalReferralsPage({ params }: Props) {
  const { slug } = await params;
  if (!(await getCompanyByPortalSlug(slug))) notFound();
  return <PortalReferralsPanel slug={slug} />;
}
