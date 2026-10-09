import { PortalEstimateView } from "@/components/portal/PortalEstimateView";
import { getCompanyByPortalSlug } from "@/lib/portal/company";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ slug: string; token: string }>;
  searchParams: Promise<{ preview?: string }>;
};

export default async function PortalEstimatePage({ params, searchParams }: Props) {
  const { slug, token } = await params;
  const { preview } = await searchParams;
  if (!(await getCompanyByPortalSlug(slug))) notFound();
  return <PortalEstimateView slug={slug} token={token} preview={preview === "1"} />;
}
