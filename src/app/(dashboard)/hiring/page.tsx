"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { stageLabel } from "@/lib/hiring/permissions";

type Applicant = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  jobSlug: string;
  jobTitle: string | null;
  aiScore: number | null;
  stage: "REJECTED" | "MAYBE" | "GOOD_FIT";
  createdAt: string;
  booking: { startAt: string } | null;
};

type Position = { jobSlug: string; jobTitle: string | null; count: number };

const STAGES: Array<Applicant["stage"]> = ["GOOD_FIT", "MAYBE", "REJECTED"];

function scoreBadgeClass(score: number | null) {
  if (score == null) return "bg-muted text-muted-foreground";
  if (score >= 10) return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (score >= 6) return "bg-amber-50 text-amber-900 border-amber-200";
  return "bg-red-50 text-red-800 border-red-200";
}

export default function HiringApplicantsPage() {
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [jobSlug, setJobSlug] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (jobSlug) params.set("jobSlug", jobSlug);
      const res = await fetch(`/api/hiring/applicants?${params}`);
      if (!res.ok) {
        toast.error("Failed to load applicants");
        return;
      }
      const data = await res.json();
      setApplicants(data.applicants ?? []);
      setPositions(data.positions ?? []);
    } finally {
      setLoading(false);
    }
  }, [jobSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const byStage = useMemo(() => {
    const map: Record<Applicant["stage"], Applicant[]> = {
      GOOD_FIT: [],
      MAYBE: [],
      REJECTED: [],
    };
    for (const row of applicants) {
      map[row.stage].push(row);
    }
    return map;
  }, [applicants]);

  async function setStage(id: string, stage: Applicant["stage"]) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/hiring/applicants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      if (!res.ok) {
        toast.error("Failed to update stage");
        return;
      }
      const updated = await res.json();
      setApplicants((current) =>
        current.map((row) => (row.id === id ? { ...row, ...updated } : row))
      );
      toast.success(`Moved to ${stageLabel(stage)}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Hiring", "Applicants"]}
        title="Applicants"
        subtitle="Careers applications scored and sorted for hiring review."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={jobSlug === "" ? "default" : "outline"}
          onClick={() => setJobSlug("")}
        >
          All positions
        </Button>
        {positions.map((pos) => (
          <Button
            key={pos.jobSlug}
            type="button"
            size="sm"
            variant={jobSlug === pos.jobSlug ? "default" : "outline"}
            onClick={() => setJobSlug(pos.jobSlug)}
          >
            {pos.jobTitle || pos.jobSlug}
            <span className="ml-1.5 text-xs opacity-70">{pos.count}</span>
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !applicants.length ? (
        <p className="text-sm text-muted-foreground">No applicants yet.</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          {STAGES.map((stage) => (
            <section key={stage} className="rounded-lg border border-border bg-white">
              <header className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">{stageLabel(stage)}</h2>
                <p className="text-xs text-muted-foreground">{byStage[stage].length} applicants</p>
              </header>
              <ul className="max-h-[70vh] space-y-0 overflow-auto">
                {byStage[stage].map((row) => (
                  <li key={row.id} className="border-b border-border px-4 py-3 last:border-b-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/hiring/applicants/${row.id}`}
                          className="truncate font-medium text-primary hover:underline"
                        >
                          {row.name}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {row.jobTitle || row.jobSlug}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded border px-1.5 py-0.5 font-mono text-[11px]",
                          scoreBadgeClass(row.aiScore)
                        )}
                      >
                        {row.aiScore != null ? `${row.aiScore}/12` : "—"}
                      </span>
                    </div>
                    {row.booking ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Screen:{" "}
                        {new Date(row.booking.startAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {STAGES.filter((s) => s !== row.stage).map((s) => (
                        <Button
                          key={s}
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          disabled={busyId === row.id}
                          onClick={() => void setStage(row.id, s)}
                        >
                          Mark {stageLabel(s).toLowerCase()}
                        </Button>
                      ))}
                    </div>
                  </li>
                ))}
                {!byStage[stage].length ? (
                  <li className="px-4 py-6 text-center text-xs text-muted-foreground">Empty</li>
                ) : null}
              </ul>
            </section>
          ))}
        </div>
      )}
    </ContentArea>
  );
}
