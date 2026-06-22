export function CallTranscriptPanel({ transcript }: { transcript: string | null | undefined }) {
  if (!transcript?.trim()) {
    return <p className="text-sm text-muted-foreground">No transcript available.</p>;
  }

  return (
    <div className="rounded-md border border-border bg-muted/20">
      <p className="whitespace-pre-wrap p-3 text-sm leading-relaxed text-muted-foreground">
        {transcript}
      </p>
    </div>
  );
}
