"use client";

import { useEffect, useState } from "react";
import { ContentArea } from "@/components/layout/ContentArea";
import { ClockInOutButton } from "@/components/home/ClockInOutButton";
import { KpiStrip } from "@/components/home/KpiStrip";
import { MaintenancePlansHomeCard } from "@/components/home/MaintenancePlansHomeCard";
import { OfficeTodoList } from "@/components/home/OfficeTodoList";
import { ImportantUpdatesPanel } from "@/components/home/ImportantUpdatesPanel";
import { SummaryCard } from "@/components/home/SummaryCard";
import { useMaintenancePlansFeatures } from "@/components/layout/CompanyBrandProvider";
import type { HomeDateRange, HomeKpi, HomeSummaryCard } from "@/lib/home/types";
import { toast } from "sonner";

export function HomePageInner() {
  const { enabled: maintenancePlansEnabled } = useMaintenancePlansFeatures();
  const [greeting, setGreeting] = useState("");
  const [cards, setCards] = useState<HomeSummaryCard[]>([]);
  const [kpis, setKpis] = useState<HomeKpi[]>([]);
  const [range, setRange] = useState<HomeDateRange>("ytd");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/home/summary?range=${range}`)
      .then((r) => r.json())
      .then((data) => {
        setGreeting(data.greeting ?? "");
        setCards(data.cards ?? []);
        setKpis(data.kpis ?? []);
      })
      .catch(() => toast.error("Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, [range]);

  return (
    <ContentArea className="max-w-[1400px]">
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">
        Hi, {greeting || "there"}
      </h1>

      <ClockInOutButton />

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <OfficeTodoList className="mb-0" />
        <ImportantUpdatesPanel className="mb-0" />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading dashboard...</p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <SummaryCard key={card.title} data={card} />
            ))}
            {maintenancePlansEnabled ? <MaintenancePlansHomeCard /> : null}
          </div>
          <KpiStrip metrics={kpis} range={range} onRangeChange={setRange} />
        </>
      )}
    </ContentArea>
  );
}
