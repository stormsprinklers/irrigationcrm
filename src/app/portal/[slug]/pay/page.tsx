import { Suspense } from "react";
import { PortalPayBalanceView } from "@/components/portal/PortalPayBalanceView";

export default async function PortalPayBalancePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading...</p>}>
      <PortalPayBalanceView slug={slug} />
    </Suspense>
  );
}
