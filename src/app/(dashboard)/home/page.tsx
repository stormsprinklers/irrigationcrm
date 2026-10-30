import { HomePageInner } from "@/components/home/HomePageInner";
import { KpiDashboard } from "@/components/reporting/KpiDashboard";
import { requireSessionUser } from "@/lib/api-auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const user = await requireSessionUser();
  if (user.role === "AFFILIATE") redirect("/affiliate");
  if (user.role === "ADMIN") {
    return <KpiDashboard variant="home" />;
  }
  return <HomePageInner showPipelineShortcut={user.role === "CSR"} />;
}
