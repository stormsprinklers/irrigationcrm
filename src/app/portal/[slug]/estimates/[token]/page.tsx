import { PortalEstimateView } from "@/components/portal/PortalEstimateView";
import { getCompanyByPortalSlug } from "@/lib/portal/company";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ slug: string; token: string }> };

export default async function PortalEstimatePage({ params }: Props) {
  const { slug, token } = await params;
  if (!(await getCompanyByPortalSlug(slug))) notFound();
  return <PortalEstimateView slug={slug} token={token} />;
}
