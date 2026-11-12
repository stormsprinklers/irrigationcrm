import { HomePageInner } from "@/components/home/HomePageInner";
import { KpiDashboard } from "@/components/reporting/KpiDashboard";
import { requireSessionUser } from "@/lib/api-auth";
import { redirect } from "next/navigation";
import { BulbPrepDashboard } from "@/components/bulb-prep/BulbPrepDashboard";

export default async function HomePage() {
  const user = await requireSessionUser();
  if (user.role === "AFFILIATE") redirect("/affiliate");
  if (user.role === "BULB_PREP") {
    return <BulbPrepDashboard name={user.name} />;
  }
  if (user.role === "ADMIN") {
    return <KpiDashboard variant="home" />;
  }
  return (
    <HomePageInner
      showPipelineShortcut={user.role === "CSR" || user.role === "MANAGER"}
    />
  );
}
