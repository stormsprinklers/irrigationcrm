"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { stageLabel } from "@/lib/hiring/permissions";
import type { ApplicantScoreBreakdown } from "@/lib/hiring/score";

type Applicant = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  jobSlug: string;
  jobTitle: string | null;
  hardWorkMeaning: string;
  integrityMeaning: string;
  inconvenientServiceExample: string;
  personalGoals: string;
  aiScore: number | null;
  aiScoreBreakdown: ApplicantScoreBreakdown | null;
  stage: "REJECTED" | "MAYBE" | "GOOD_FIT";
  createdAt: string;
  booking: { startAt: string } | null;
};

type Position = { jobSlug: string; jobTitle: string | null; count: number };

const STAGES: Array<Applicant["stage"]> = ["GOOD_FIT", "MAYBE", "REJECTED"];

const RESPONSE_SECTIONS: Array<{
  key: keyof Pick<
    Applicant,
    "hardWorkMeaning" | "inconvenientServiceExample" | "integrityMeaning" | "personalGoals"
  >;
  scoreKey: keyof Pick<ApplicantScoreBreakdown, "hardWork" | "service" | "integrity" | "goals">;
  label: string;
  prompt: string;
}> = [
  {
    key: "hardWorkMeaning",
    scoreKey: "hardWork",
    label: "Hard work",
    prompt: "What does hard work mean to you?",
  },
  {
    key: "inconvenientServiceExample",
    scoreKey: "service",
    label: "Service",
    prompt: "What was a time when you served someone when it was inconvenient?",
  },
  {
    key: "integrityMeaning",
    scoreKey: "integrity",
    label: "Integrity",
    prompt: "What does it mean to have integrity?",
  },
  {
    key: "personalGoals",
    scoreKey: "goals",
    label: "Goals",
    prompt: "What personal goals are you currently working on?",
  },
];

export default function HiringApplicantsPage() {
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [jobSlug, setJobSlug] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rescoringId, setRescoringId] = useState<string | null>(null);

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

  async function ensureBreakdown(row: Applicant) {
    if (row.aiScoreBreakdown) return;
    setRescoringId(row.id);
    try {
      const res = await fetch(`/api/hiring/applicants/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rescore: true }),
      });
      if (!res.ok) {
        toast.error("Could not load response grades");
        return;
      }
      const updated = (await res.json()) as Applicant;
      setApplicants((current) =>
        current.map((item) => (item.id === row.id ? { ...item, ...updated } : item))
      );
    } finally {
      setRescoringId(null);
    }
  }

  function toggleExpand(row: Applicant) {
    const next = expandedId === row.id ? null : row.id;
    setExpandedId(next);
    if (next) void ensureBreakdown(row);
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
                {byStage[stage].map((row) => {
                  const open = expandedId === row.id;
                  return (
                    <li key={row.id} className="border-b border-border px-4 py-3 last:border-b-0">
                      <div className="flex items-start gap-1">
                        <button
                          type="button"
                          className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-expanded={open}
                          aria-label={open ? "Hide responses" : "Show responses"}
                          onClick={() => toggleExpand(row)}
                        >
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 transition-transform",
                              open && "rotate-180"
                            )}
                          />
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <Link
                              href={`/hiring/applicants/${row.id}`}
                              className="truncate font-medium text-foreground hover:underline"
                            >
                              {row.name}
                            </Link>
                            <span className="font-mono text-sm font-semibold text-blue-600">
                              {row.aiScore != null ? `${row.aiScore}/12` : "—/12"}
                            </span>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {row.jobTitle || row.jobSlug}
                          </p>
                        </div>
                      </div>

                      {open ? (
                        <div className="mt-3 space-y-3 border-t border-border pt-3 pl-5">
                          {rescoringId === row.id && !row.aiScoreBreakdown ? (
                            <p className="text-xs text-muted-foreground">Loading grades…</p>
                          ) : null}
                          {RESPONSE_SECTIONS.map((section) => {
                            const grade = row.aiScoreBreakdown?.[section.scoreKey];
                            return (
                              <div key={section.key}>
                                <div className="mb-1 flex items-baseline justify-between gap-2">
                                  <p className="text-xs font-medium text-foreground">
                                    {section.label}
                                    <span className="ml-1 font-normal text-muted-foreground">
                                      — {section.prompt}
                                    </span>
                                  </p>
                                  <span className="shrink-0 font-mono text-xs font-semibold text-blue-600">
                                    {grade != null ? `${grade}/3` : "—/3"}
                                  </span>
                                </div>
                                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                                  {row[section.key] || "—"}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      {row.booking ? (
                        <p className="mt-1 pl-5 text-[11px] text-muted-foreground">
                          Screen:{" "}
                          {new Date(row.booking.startAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-1 pl-5">
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
                  );
                })}
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
