import { PortalPayBalanceView } from "@/components/portal/PortalPayBalanceView";

export default async function PortalPayBalancePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PortalPayBalanceView slug={slug} />;
}
