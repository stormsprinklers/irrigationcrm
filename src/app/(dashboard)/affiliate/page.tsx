import { redirect } from "next/navigation";
import { AffiliateIntegrationSetup } from "@/components/affiliate/AffiliateIntegrationSetup";
import { requireSessionUser } from "@/lib/api-auth";

export default async function AffiliateIntegrationPage() {
  const user = await requireSessionUser();
  if (user.role !== "AFFILIATE") redirect("/home");
  return <AffiliateIntegrationSetup />;
}
