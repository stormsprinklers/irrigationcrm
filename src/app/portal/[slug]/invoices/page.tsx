import { Suspense } from "react";
import { PortalInvoicesList } from "@/components/portal/PortalInvoicesList";
import { getCompanyByPortalSlug } from "@/lib/portal/company";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ slug: string }> };

export default async function PortalInvoicesPage({ params }: Props) {
  const { slug } = await params;
  if (!(await getCompanyByPortalSlug(slug))) notFound();
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading...</p>}>
      <PortalInvoicesList slug={slug} />
    </Suspense>
  );
}
