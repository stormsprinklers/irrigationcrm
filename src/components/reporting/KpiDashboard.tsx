"use client";

import { useCallback, useEffect, useState } from "react";
import { Wrench, Headphones, UsersRound, TrendingUp, HardHat } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReportDateRangeControl } from "@/components/reporting/ReportDateRangeControl";
import { blobProxyUrl } from "@/lib/blob/urls";
import { buildReportRangeQuery, PRESET_RANGE_LABELS, type ReportRangeInput } from "@/lib/reporting/date-range";
import type {
  KpiCrewCard,
  KpiDashboardReport,
  KpiPersonCard,
} from "@/lib/reporting/kpi-dashboard";
import { cn } from "@/lib/utils";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function PersonAvatar({
  name,
  photoUrl,
  color,
}: {
  name: string;
  photoUrl: string | null;
  color: string | null;
}) {
  return (
    <Avatar className="h-12 w-12 shrink-0">
      {photoUrl ? <AvatarImage src={blobProxyUrl(photoUrl)} alt={name} /> : null}
      <AvatarFallback
        className="text-sm font-medium text-white"
        style={{ backgroundColor: color ?? "#64748B" }}
      >
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

function KpiCardGrid({ metrics }: { metrics: { label: string; value: string }[] }) {
  return (
    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
      {metrics.map((metric) => (
        <div key={metric.label}>
          <dt className="text-xs text-muted-foreground">{metric.label}</dt>
          <dd className="text-sm font-semibold">{metric.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PersonKpiCard({ person }: { person: KpiPersonCard }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <PersonAvatar name={person.name} photoUrl={person.photoUrl} color={person.color} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{person.name}</p>
          </div>
        </div>
        <KpiCardGrid metrics={person.metrics} />
      </CardContent>
    </Card>
  );
}

function CrewKpiCard({ crew }: { crew: KpiCrewCard }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ backgroundColor: crew.color }}
          >
            {crew.name
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold">{crew.name}</p>
            <p className="text-xs text-muted-foreground">Crew</p>
          </div>
        </div>
        <KpiCardGrid metrics={crew.metrics} />
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  icon: Icon,
  emptyMessage,
  children,
  hasItems,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  emptyMessage: string;
  children: React.ReactNode;
  hasItems: boolean;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {hasItems ? children : <p className="text-sm text-muted-foreground">{emptyMessage}</p>}
    </section>
  );
}

export function KpiDashboard() {
  const [rangeInput, setRangeInput] = useState<ReportRangeInput>({ preset: "ytd" });
  const [data, setData] = useState<KpiDashboardReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (nextRange: ReportRangeInput) => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/reporting/kpi-dashboard?${buildReportRangeQuery(nextRange)}`);
      if (!res.ok) throw new Error("Failed to load");
      setData(await res.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(rangeInput);
  }, [rangeInput, load]);

  const rangeLabel =
    data?.rangeLabel ??
    (rangeInput.preset === "custom"
      ? `${rangeInput.start} – ${rangeInput.end}`
      : PRESET_RANGE_LABELS[rangeInput.preset]);

  return (
    <ContentArea className="max-w-[1400px]">
      <PageHeader
        breadcrumb={["Reporting", "KPI Dashboard"]}
        title="KPI Dashboard"
        subtitle="Team performance across technicians, CSRs, crews, and sales"
        actions={
          <ReportDateRangeControl
            value={rangeInput}
            label={rangeLabel}
            onChange={setRangeInput}
          />
        }
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading dashboard…</p>
      ) : error || !data ? (
        <p className="text-sm text-destructive">Failed to load KPI dashboard.</p>
      ) : (
        <div className="space-y-10">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium text-muted-foreground">
                Company overview · {data.rangeLabel}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                {data.company.map((metric, index) => (
                  <div
                    key={metric.label}
                    className={cn(
                      index > 0 &&
                        "border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0"
                    )}
                  >
                    <p className="text-xs text-muted-foreground">{metric.label}</p>
                    <p className="mt-1 text-xl font-semibold">{metric.value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Section
            title="Technicians"
            icon={Wrench}
            emptyMessage="No solo technicians found."
            hasItems={data.technicians.length > 0}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.technicians.map((tech) => (
                <PersonKpiCard key={tech.id} person={tech} />
              ))}
            </div>
          </Section>

          <Section
            title="Installers"
            icon={HardHat}
            emptyMessage="No solo installers found."
            hasItems={data.installers.length > 0}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.installers.map((installer) => (
                <PersonKpiCard key={installer.id} person={installer} />
              ))}
            </div>
          </Section>

          <Section
            title="CSRs"
            icon={Headphones}
            emptyMessage="No CSRs found."
            hasItems={data.csrs.length > 0}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.csrs.map((csr) => (
                <PersonKpiCard key={csr.id} person={csr} />
              ))}
            </div>
          </Section>

          <Section
            title="Crews"
            icon={UsersRound}
            emptyMessage="No crews configured."
            hasItems={data.crews.length > 0}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.crews.map((crew) => (
                <CrewKpiCard key={crew.id} crew={crew} />
              ))}
            </div>
          </Section>

          <Section
            title="Salespeople"
            icon={TrendingUp}
            emptyMessage='No salespeople found. Assign the Sales role in Settings → Employees.'
            hasItems={data.salespeople.length > 0}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.salespeople.map((person) => (
                <PersonKpiCard key={person.id} person={person} />
              ))}
            </div>
          </Section>
        </div>
      )}
    </ContentArea>
  );
}
