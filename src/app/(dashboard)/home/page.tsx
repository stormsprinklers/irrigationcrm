import { HomePageInner } from "@/components/home/HomePageInner";
import { KpiDashboard } from "@/components/reporting/KpiDashboard";
import { requireSessionUser } from "@/lib/api-auth";

export default async function HomePage() {
  const user = await requireSessionUser();
  if (user.role === "ADMIN") {
    return <KpiDashboard variant="home" />;
  }
  return <HomePageInner />;
}
