"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, PanelLeft, PenSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type InboxListDetailShellProps = {
  chrome: React.ReactNode;
  list: React.ReactNode;
  detail: React.ReactNode;
  listLabel?: string;
  selectedId?: string | null;
  /** When true, mobile shows the conversation list by default (not compose/detail). */
  listFirst?: boolean;
  /** Explicit compose mode (list-first SMS). */
  composing?: boolean;
  onCompose?: () => void;
  onMobileBack?: () => void;
  className?: string;
};

/**
 * Shared inbox list + detail split:
 * - Desktop: side-by-side
 * - Mobile (default): detail fills screen; list is a drawer
 * - Mobile (listFirst): list fills screen until a thread/compose is opened
 */
export function InboxListDetailShell({
  chrome,
  list,
  detail,
  listLabel = "Conversations",
  selectedId = null,
  listFirst = false,
  composing = false,
  onCompose,
  onMobileBack,
  className,
}: InboxListDetailShellProps) {
  const [listOpen, setListOpen] = useState(false);
  const showDetailOnMobile = Boolean(selectedId) || composing;
  const showListPane = listFirst ? !showDetailOnMobile : true;

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
      {/* Mobile chrome — list-first list view */}
      {listFirst && !showDetailOnMobile ? (
        <div className="flex shrink-0 flex-col gap-2 border-b border-border bg-white px-3 py-2.5 md:hidden">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{listLabel}</p>
            {onCompose ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={onCompose}
                aria-label="New message"
              >
                <PenSquare className="h-5 w-5" />
              </Button>
            ) : null}
          </div>
          <div className="min-w-0">{chrome}</div>
        </div>
      ) : null}

      {/* Mobile chrome — detail / compose with back */}
      {listFirst && showDetailOnMobile ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-white px-2 py-2 md:hidden">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 gap-1 px-2"
            onClick={() => onMobileBack?.()}
          >
            <ChevronLeft className="h-4 w-4" />
            {listLabel}
          </Button>
        </div>
      ) : null}

      {/* Mobile chrome — legacy drawer toggle (non list-first) */}
      {!listFirst ? (
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
      ) : null}

      {!listFirst && listOpen ? (
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
          "md:relative md:flex md:h-full md:w-72 md:shrink-0 md:shadow-none",
          listFirst
            ? cn(
                "min-h-0 flex-1 md:flex-none",
                showListPane ? "flex" : "hidden md:flex"
              )
            : cn(
                "absolute inset-y-0 left-0 z-40 w-[min(16.5rem,78vw)] shadow-lg md:static",
                !listOpen && "hidden md:flex"
              )
        )}
      >
        <div className="hidden shrink-0 border-b border-border px-4 py-3 md:block">
          {chrome}
        </div>
        {!listFirst ? (
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
        ) : (
          <div className="hidden items-center justify-between border-b border-border px-4 py-2 md:flex">
            <span className="text-sm font-medium">{listLabel}</span>
            {onCompose ? (
              <Button variant="ghost" size="icon" onClick={onCompose} aria-label="New message">
                <PenSquare className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-hidden">{list}</div>
      </aside>

      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white",
          listFirst
            ? showDetailOnMobile
              ? "flex"
              : "hidden md:flex"
            : "flex"
        )}
      >
        {detail}
      </div>
    </div>
  );
}
