"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type CallDispositionValue = "BOOKED" | "NOT_BOOKED" | "NON_OPPORTUNITY";

const DISPOSITIONS: Array<{ value: CallDispositionValue; label: string; description: string }> = [
  { value: "BOOKED", label: "Booked", description: "Appointment scheduled from this call" },
  { value: "NOT_BOOKED", label: "Not booked", description: "Opportunity but no appointment yet" },
  { value: "NON_OPPORTUNITY", label: "Non-opportunity", description: "Wrong number, spam, etc." },
];

export function CallWrapUpModal({
  open,
  sessionId,
  visitId,
  onComplete,
  onClose,
}: {
  open: boolean;
  sessionId: string | null;
  visitId?: string | null;
  onComplete?: () => void;
  onClose: () => void;
}) {
  const [disposition, setDisposition] = useState<CallDispositionValue | "">("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open || !sessionId) return null;

  async function handleSubmit() {
    if (!disposition) {
      toast.error("Select a disposition");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/voice/calls/${sessionId}/disposition`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          disposition,
          dispositionNote: note.trim() || undefined,
          visitId: disposition === "BOOKED" ? visitId ?? undefined : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save disposition");
      }
      toast.success("Call disposition saved");
      setDisposition("");
      setNote("");
      onComplete?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Wrap up call</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          How did this call go? Disposition is required before taking the next call.
        </p>

        <div className="mt-4 space-y-2">
          {DISPOSITIONS.map((d) => (
            <label
              key={d.value}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
                disposition === d.value ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <input
                type="radio"
                name="disposition"
                value={d.value}
                checked={disposition === d.value}
                onChange={() => setDisposition(d.value)}
                className="mt-1"
              />
              <div>
                <p className="font-medium">{d.label}</p>
                <p className="text-xs text-muted-foreground">{d.description}</p>
              </div>
            </label>
          ))}
        </div>

        {disposition === "BOOKED" && visitId && (
          <p className="mt-3 text-sm text-green-700">Linked to scheduled visit.</p>
        )}

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium">Note (optional)</label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Brief note" />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Skip for now
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={!disposition || submitting}>
            {submitting ? "Saving..." : "Save disposition"}
          </Button>
        </div>
      </div>
    </div>
  );
}
