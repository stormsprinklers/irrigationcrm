"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  callId: string;
  transcript: string | null | undefined;
  hasRecording?: boolean;
  onTranscribed?: (transcript: string) => void;
};

export function CallTranscriptPanel({
  callId,
  transcript: initialTranscript,
  hasRecording = false,
  onTranscribed,
}: Props) {
  const [transcript, setTranscript] = useState(initialTranscript ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/voice/calls/history/${callId}/transcribe`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Transcription failed");
      }
      const text = typeof data.transcript === "string" ? data.transcript : "";
      if (text) {
        setTranscript(text);
        onTranscribed?.(text);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcription failed");
    } finally {
      setBusy(false);
    }
  }

  if (transcript?.trim()) {
    return (
      <div className="rounded-md border border-border bg-muted/20">
        <p className="whitespace-pre-wrap p-3 text-sm leading-relaxed text-foreground">
          {transcript}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">No transcript available.</p>
      {hasRecording ? (
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void generate()}>
          {busy ? "Transcribing…" : "Generate transcript"}
        </Button>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
