import { redirect } from "next/navigation";
import { PipelinePageContent } from "@/components/customers/PipelinePageContent";
import { requireSessionUser } from "@/lib/api-auth";
import { canViewSalesPipeline } from "@/lib/customers/permissions";

export default async function CustomerPipelinePage() {
  const user = await requireSessionUser();
  if (!canViewSalesPipeline(user.role)) redirect("/customers");
  return <PipelinePageContent />;
}
