"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
  interest: string | null;
  hardWorkMeaning: string;
  integrityMeaning: string;
  inconvenientServiceExample: string;
  personalGoals: string;
  aiScore: number | null;
  stage: "REJECTED" | "MAYBE" | "GOOD_FIT";
  stageSource: string;
  bookingInviteSentAt: string | null;
  createdAt: string;
  booking: {
    id: string;
    startAt: string;
    endAt: string;
    status: string;
    manager: { id: string; name: string } | null;
  } | null;
};

const STAGES: Array<Applicant["stage"]> = ["GOOD_FIT", "MAYBE", "REJECTED"];

export default function HiringApplicantDetailPage() {
  const params = useParams<{ id: string }>();
  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/hiring/applicants/${params.id}`);
      if (!res.ok) {
        toast.error("Applicant not found");
        setApplicant(null);
        return;
      }
      setApplicant(await res.json());
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStage(stage: Applicant["stage"]) {
    if (!applicant) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/hiring/applicants/${applicant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      if (!res.ok) {
        toast.error("Failed to update");
        return;
      }
      setApplicant(await res.json());
      toast.success(`Moved to ${stageLabel(stage)}`);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <ContentArea>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </ContentArea>
    );
  }

  if (!applicant) {
    return (
      <ContentArea>
        <p className="text-sm text-muted-foreground">Applicant not found.</p>
        <Button asChild variant="outline" className="mt-3">
          <Link href="/hiring">Back to applicants</Link>
        </Button>
      </ContentArea>
    );
  }

  return (
    <ContentArea className="max-w-3xl">
      <PageHeader
        breadcrumb={["Hiring", "Applicants", applicant.name]}
        title={applicant.name}
        subtitle={applicant.jobTitle || applicant.jobSlug}
        actions={
          <div className="flex flex-wrap gap-2">
            {STAGES.map((stage) => (
              <Button
                key={stage}
                type="button"
                size="sm"
                variant={applicant.stage === stage ? "default" : "outline"}
                disabled={busy || applicant.stage === stage}
                onClick={() => void setStage(stage)}
              >
                {stageLabel(stage)}
              </Button>
            ))}
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "rounded border px-2 py-1 font-mono text-sm",
            applicant.aiScore != null && applicant.aiScore >= 10
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : applicant.aiScore != null && applicant.aiScore >= 6
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-border bg-muted text-muted-foreground"
          )}
        >
          Score {applicant.aiScore != null ? `${applicant.aiScore}/12` : "pending"}
        </span>
        <span className="text-sm text-muted-foreground">
          Stage: {stageLabel(applicant.stage)} ({applicant.stageSource.toLowerCase()})
        </span>
      </div>

      <section className="mb-6 space-y-2 rounded-lg border border-border bg-white p-4 text-sm">
        <p>
          <span className="text-muted-foreground">Email:</span> {applicant.email}
        </p>
        <p>
          <span className="text-muted-foreground">Phone:</span> {applicant.phone ?? "—"}
        </p>
        <p>
          <span className="text-muted-foreground">Applied:</span>{" "}
          {new Date(applicant.createdAt).toLocaleString()}
        </p>
        {applicant.bookingInviteSentAt ? (
          <p>
            <span className="text-muted-foreground">Screen invite sent:</span>{" "}
            {new Date(applicant.bookingInviteSentAt).toLocaleString()}
          </p>
        ) : null}
        {applicant.booking ? (
          <p>
            <span className="text-muted-foreground">Phone screen:</span>{" "}
            {new Date(applicant.booking.startAt).toLocaleString()}
            {applicant.booking.manager ? ` with ${applicant.booking.manager.name}` : ""}
          </p>
        ) : null}
      </section>

      {applicant.interest ? (
        <AnswerBlock title="Why interested" body={applicant.interest} />
      ) : null}
      <AnswerBlock title="What does hard work mean to you?" body={applicant.hardWorkMeaning} />
      <AnswerBlock
        title="What was a time when you served someone when it was inconvenient?"
        body={applicant.inconvenientServiceExample}
      />
      <AnswerBlock title="What does it mean to have integrity?" body={applicant.integrityMeaning} />
      <AnswerBlock
        title="What personal goals are you currently working on?"
        body={applicant.personalGoals}
      />
    </ContentArea>
  );
}

function AnswerBlock({ title, body }: { title: string; body: string }) {
  return (
    <section className="mb-4 rounded-lg border border-border bg-white p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">{body}</p>
    </section>
  );
}
