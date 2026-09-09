"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mergeTokenLabel, type ParsedMergeToken } from "@/lib/notifications/merge-tokens";

export function MergeTokenFallbackEditor({
  token,
  onFallbackChange,
  onClose,
}: {
  token: ParsedMergeToken;
  onFallbackChange: (fallback: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(token.fallback);

  useEffect(() => {
    setDraft(token.fallback);
  }, [token.raw, token.fallback, token.start]);

  return (
    <div className="rounded-lg border border-border bg-white p-3 shadow-lg">
      <p className="text-sm font-semibold text-foreground">{mergeTokenLabel(token.key)}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        If this customer doesn&apos;t have this information, show:
      </p>
      <Input
        className="mt-2"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Leave blank to show nothing"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onFallbackChange(draft);
            onClose();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            onFallbackChange(draft);
            onClose();
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
