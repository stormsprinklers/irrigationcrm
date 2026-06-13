import { ContentArea } from "@/components/layout/ContentArea";
import { KpiStrip } from "@/components/home/KpiStrip";
import { MaintenancePlansHomeCard } from "@/components/home/MaintenancePlansHomeCard";
import { SummaryCard } from "@/components/home/SummaryCard";
import { homeKpis } from "@/lib/mock/home-kpis";
import { homeSummaryCards } from "@/lib/mock/home-summary";
import { currentUser } from "@/lib/mock/user";

export default function HomePage() {
  return (
    <ContentArea className="max-w-[1400px]">
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">
        Hi, {currentUser.name}
      </h1>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {homeSummaryCards
          .filter((card) => card.title !== "Maintenance Plans")
          .map((card) => (
            <SummaryCard key={card.title} data={card} />
          ))}
        <MaintenancePlansHomeCard />
      </div>

      <KpiStrip metrics={homeKpis} />
    </ContentArea>
  );
}
