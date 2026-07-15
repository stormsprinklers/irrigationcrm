"use client";

import { useEffect, useState } from "react";
import { PanelLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type InboxListDetailShellProps = {
  /** Breadcrumbs, tabs, and other chrome shown above the list on desktop / in the mobile top bar. */
  chrome: React.ReactNode;
  list: React.ReactNode;
  detail: React.ReactNode;
  /** Label for the mobile list drawer toggle and header. */
  listLabel?: string;
  /**
   * When this becomes a non-empty string, the mobile list drawer closes so the
   * selected conversation / lead detail fills the viewport.
   */
  selectedId?: string | null;
  className?: string;
};

/**
 * Shared inbox list + detail split:
 * - Desktop: side-by-side, list is a fixed narrow column.
 * - Mobile: detail fills the screen; list is a collapsible overlay drawer.
 */
export function InboxListDetailShell({
  chrome,
  list,
  detail,
  listLabel = "Conversations",
  selectedId = null,
  className,
}: InboxListDetailShellProps) {
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => {
    if (selectedId) setListOpen(false);
  }, [selectedId]);

  return (
    <div
      className={cn(
        "relative flex h-full w-full min-w-0 flex-col overflow-hidden md:flex-row",
        className
      )}
    >
      <div className="flex shrink-0 flex-col gap-2 border-b border-border bg-white px-3 py-2.5 md:hidden">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-fit shrink-0 gap-1.5 px-2.5"
          onClick={() => setListOpen(true)}
          aria-expanded={listOpen}
          aria-controls="inbox-list-drawer"
        >
          <PanelLeft className="h-4 w-4" />
          <span className="text-xs font-medium">{listLabel}</span>
        </Button>
        <div className="min-w-0">{chrome}</div>
      </div>

      {listOpen ? (
        <button
          type="button"
          className="absolute inset-0 z-30 bg-black/40 md:hidden"
          aria-label={`Close ${listLabel}`}
          onClick={() => setListOpen(false)}
        />
      ) : null}

      <aside
        id="inbox-list-drawer"
        className={cn(
          "flex flex-col border-r border-border bg-white",
          // Desktop: always-visible narrow column
          "md:relative md:flex md:h-full md:w-72 md:shrink-0 md:shadow-none",
          // Mobile: narrower overlay drawer
          "absolute inset-y-0 left-0 z-40 w-[min(16.5rem,78vw)] shadow-lg md:static",
          !listOpen && "hidden md:flex"
        )}
      >
        <div className="hidden shrink-0 border-b border-border px-4 py-3 md:block">
          {chrome}
        </div>
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2 md:hidden">
          <span className="text-sm font-medium">{listLabel}</span>
          <button
            type="button"
            onClick={() => setListOpen(false)}
            className="rounded p-1 hover:bg-muted"
            aria-label={`Close ${listLabel}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{list}</div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
        {detail}
      </div>
    </div>
  );
}
