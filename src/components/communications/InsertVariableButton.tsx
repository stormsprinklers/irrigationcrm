"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MERGE_FIELDS,
  organizeMergeFields,
  insertTokenAt,
  type MergeFieldItem,
} from "@/lib/notifications/templates";
import { cn } from "@/lib/utils";

type TextField = HTMLInputElement | HTMLTextAreaElement;

const lastInputSelection = new WeakMap<TextField, { start: number; end: number }>();

export function rememberInputSelection(el: TextField | null) {
  if (!el || el.selectionStart == null) return;
  lastInputSelection.set(el, {
    start: el.selectionStart,
    end: el.selectionEnd ?? el.selectionStart,
  });
}

export function applyTokenToInput(
  el: TextField | null,
  value: string,
  token: string
) {
  const remembered = el ? lastInputSelection.get(el) : undefined;
  const live = Boolean(el && document.activeElement === el && el.selectionStart != null);
  const start = live
    ? el!.selectionStart ?? value.length
    : remembered?.start ?? el?.selectionStart ?? value.length;
  const end = live
    ? el!.selectionEnd ?? start
    : remembered?.end ?? el?.selectionEnd ?? start;
  const result = insertTokenAt(value, token, start, end);
  if (el) lastInputSelection.set(el, { start: result.caret, end: result.caret });
  requestAnimationFrame(() => {
    if (!el) return;
    el.focus();
    el.setSelectionRange(result.caret, result.caret);
    rememberInputSelection(el);
  });
  return result;
}

type Props = {
  onInsert: (token: string) => void;
  fields?: readonly MergeFieldItem[];
  className?: string;
  size?: "sm" | "default";
};

export function InsertVariableButton({
  onInsert,
  fields = MERGE_FIELDS,
  className,
  size = "sm",
}: Props) {
  const organized = organizeMergeFields(fields, 0);
  const folders =
    organized.mode === "folders" ? organized.folders : [{ label: "", items: [...organized.items] }];

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={size}
          className={cn("gap-1", className)}
          onPointerDown={() => {
            const el = document.activeElement;
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
              rememberInputSelection(el);
            }
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Variable
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="z-[200] max-h-80 min-w-[14rem] overflow-y-auto"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {folders.map((folder, index) => (
          <div key={folder.label || "fields"}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            {folder.label ? <DropdownMenuLabel>{folder.label}</DropdownMenuLabel> : null}
            {folder.items.map((field) => (
              <DropdownMenuItem
                key={field.token}
                onPointerDown={(event) => event.preventDefault()}
                onSelect={() => onInsert(field.token)}
              >
                {field.label}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
