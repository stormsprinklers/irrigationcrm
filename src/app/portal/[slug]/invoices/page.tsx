import { PortalInvoicesList } from "@/components/portal/PortalInvoicesList";
import { getCompanyByPortalSlug } from "@/lib/portal/company";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ slug: string }> };

export default async function PortalInvoicesPage({ params }: Props) {
  const { slug } = await params;
  if (!(await getCompanyByPortalSlug(slug))) notFound();
  return <PortalInvoicesList slug={slug} />;
}
