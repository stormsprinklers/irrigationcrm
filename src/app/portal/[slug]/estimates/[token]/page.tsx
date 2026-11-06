import type { Metadata } from "next";
import { PortalEstimateView } from "@/components/portal/PortalEstimateView";
import { getCompanyByPortalSlug } from "@/lib/portal/company";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "View My Quote",
  openGraph: {
    title: "View My Quote",
  },
  twitter: {
    title: "View My Quote",
  },
};

type Props = {
  params: Promise<{ slug: string; token: string }>;
  searchParams: Promise<{ preview?: string; previewToken?: string }>;
};

export default async function PortalEstimatePage({ params, searchParams }: Props) {
  const { slug, token } = await params;
  const { preview, previewToken } = await searchParams;
  const isDevelopmentPreview =
    process.env.NODE_ENV === "development" &&
    slug === "holiday-terms-preview" &&
    token === "sample";
  if (!isDevelopmentPreview && !(await getCompanyByPortalSlug(slug))) notFound();
  return (
    <PortalEstimateView
      slug={slug}
      token={token}
      preview={preview === "1"}
      previewToken={previewToken}
    />
  );
}
