import { ScrollArea } from "@/components/ui/scroll-area";

export function CallTranscriptPanel({ transcript }: { transcript: string | null | undefined }) {
  if (!transcript?.trim()) {
    return <p className="text-sm text-muted-foreground">No transcript available.</p>;
  }

  return (
    <ScrollArea className="max-h-48 rounded-md border border-border bg-muted/20">
      <p className="whitespace-pre-wrap p-3 text-sm leading-relaxed text-muted-foreground">
        {transcript}
      </p>
    </ScrollArea>
  );
}
