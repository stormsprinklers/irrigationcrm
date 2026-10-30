import { redirect } from "next/navigation";
import { AffiliatePipeline } from "@/components/affiliate/AffiliatePipeline";
import { requireSessionUser } from "@/lib/api-auth";

export default async function AffiliatePipelinePage() {
  const user = await requireSessionUser();
  if (user.role !== "AFFILIATE") redirect("/home");
  return <AffiliatePipeline />;
}
