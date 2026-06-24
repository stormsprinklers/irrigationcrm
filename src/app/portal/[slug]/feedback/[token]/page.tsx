"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function FeedbackSurveyPage() {
  const params = useParams<{ slug: string; token: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [visitTitle, setVisitTitle] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/portal/feedback/${params.token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setCompanyName(data.companyName ?? "");
        setVisitTitle(data.visitTitle ?? "");
        if (data.alreadySubmitted) setDone(true);
      })
      .catch(() => setError("Failed to load survey"))
      .finally(() => setLoading(false));
  }, [params.token]);

  async function submit() {
    if (rating < 1) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/portal/feedback/${params.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-md p-8 text-center text-muted-foreground">Loading…</div>
    );
  }

  if (error && !companyName) {
    return (
      <div className="mx-auto max-w-md p-8 text-center text-destructive">{error}</div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-8 text-center">
        <h1 className="text-xl font-semibold">Thank you!</h1>
        <p className="text-muted-foreground">Your feedback helps {companyName} improve.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-8">
      <div className="text-center">
        <h1 className="text-xl font-semibold">How was your visit?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {visitTitle} — {companyName}
        </p>
      </div>

      <div className="flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            className={`h-12 w-12 rounded-full border text-lg font-medium ${
              rating >= n ? "bg-primary text-primary-foreground border-primary" : "bg-background"
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      <textarea
        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        placeholder="Optional comments…"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={4}
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button className="w-full" onClick={submit} disabled={submitting || rating < 1}>
        {submitting ? "Submitting…" : "Submit feedback"}
      </Button>
    </div>
  );
}
