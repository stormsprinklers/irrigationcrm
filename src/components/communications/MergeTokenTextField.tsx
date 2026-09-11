"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type Ref,
  type TextareaHTMLAttributes,
} from "react";
import { rememberInputSelection } from "@/components/communications/InsertVariableButton";
import { MergeTokenFallbackEditor } from "@/components/communications/MergeTokenFallbackEditor";
import {
  findMergeTokenAt,
  parseMergeTokens,
  replaceMergeTokenFallback,
  type ParsedMergeToken,
} from "@/lib/notifications/merge-tokens";
import { cn } from "@/lib/utils";

type CommonProps = {
  value: string;
  onChange: (value: string) => void;
  tone?: "light" | "dark";
  multiline?: boolean;
  className?: string;
};

type Props = CommonProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement> & InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className">;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightMergeTokens(value: string) {
  const tokens = parseMergeTokens(value);
  if (tokens.length === 0) return escapeHtml(value);
  let html = "";
  let cursor = 0;
  for (const token of tokens) {
    html += escapeHtml(value.slice(cursor, token.start));
    html += `<mark>${escapeHtml(token.raw)}</mark>`;
    cursor = token.end;
  }
  html += escapeHtml(value.slice(cursor));
  return html;
}

export const MergeTokenTextField = forwardRef<HTMLTextAreaElement | HTMLInputElement, Props>(
  function MergeTokenTextField(
    { value, onChange, className, tone = "light", multiline = true, onClick, onKeyUp, onScroll, ...rest },
    ref
  ) {
    const innerRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
    const backdropRef = useRef<HTMLDivElement | null>(null);
    const editingRef = useRef<ParsedMergeToken | null>(null);
    const valueRef = useRef(value);
    valueRef.current = value;
    const [editing, setEditing] = useState<ParsedMergeToken | null>(null);

    const setRefs = useCallback(
      (node: HTMLTextAreaElement | HTMLInputElement | null) => {
        innerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as { current: typeof node }).current = node;
      },
      [ref]
    );

    function syncScroll() {
      const el = innerRef.current;
      const backdrop = backdropRef.current;
      if (!el || !backdrop) return;
      backdrop.scrollTop = el.scrollTop;
      backdrop.scrollLeft = el.scrollLeft;
    }

    useEffect(() => {
      syncScroll();
    }, [value]);

    function inspectCaret() {
      const el = innerRef.current;
      if (!el) return;
      rememberInputSelection(el);
      const pos = el.selectionStart ?? 0;
      const hit = findMergeTokenAt(valueRef.current, pos);
      editingRef.current = hit;
      setEditing(hit);
    }

    function applyFallback(fallback: string) {
      const current = editingRef.current;
      if (!current) return;
      const next = replaceMergeTokenFallback(valueRef.current, current, fallback);
      const nextToken = findMergeTokenAt(next, current.start);
      editingRef.current = nextToken;
      setEditing(nextToken);
      onChange(next);
    }

    // Chrome (margin, min-height, width) stays on the outer wrap. Padding, border, and
    // font stay on the in-flow field. The highlight layer copies that inner box with a
    // transparent border so it does not draw a second outline or pick up the field's margin.
    const fieldClassName = cn(
      "font-[inherit] leading-[inherit]",
      multiline && "whitespace-pre-wrap break-words",
      className,
      "relative z-[1] m-0 block bg-transparent",
      tone === "light"
        ? "caret-foreground text-transparent placeholder:text-muted-foreground"
        : "caret-white text-transparent placeholder:text-slate-500"
    );
    const backdropClassName = cn(
      "merge-token-backdrop pointer-events-none absolute inset-0 overflow-auto font-[inherit] leading-[inherit]",
      tone === "dark" && "merge-token-backdrop-dark",
      multiline ? "whitespace-pre-wrap break-words" : "overflow-x-auto whitespace-nowrap",
      className,
      "m-0 block h-auto min-h-0 border-transparent bg-transparent shadow-none",
      tone === "dark" ? "text-slate-100" : "text-foreground"
    );

    return (
      <div className={cn("relative", className, "block border-0 p-0 shadow-none ring-0 resize-none")}>
        <div className="relative overflow-hidden rounded-[inherit]">
          <div
            ref={backdropRef}
            aria-hidden
            className={backdropClassName}
            dangerouslySetInnerHTML={{ __html: highlightMergeTokens(value) + (multiline ? "\n" : "") }}
          />
          {multiline ? (
            <textarea
              {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
              ref={setRefs as Ref<HTMLTextAreaElement>}
              value={value}
              className={fieldClassName}
              onChange={(e) => onChange(e.target.value)}
              onScroll={(e) => {
                syncScroll();
                onScroll?.(e);
              }}
              onClick={(e) => {
                inspectCaret();
                onClick?.(e as never);
              }}
              onSelect={() => inspectCaret()}
              onKeyUp={(e) => {
                inspectCaret();
                onKeyUp?.(e as never);
              }}
              onBlur={() => rememberInputSelection(innerRef.current)}
            />
          ) : (
            <input
              {...(rest as InputHTMLAttributes<HTMLInputElement>)}
              ref={setRefs as Ref<HTMLInputElement>}
              value={value}
              className={fieldClassName}
              onChange={(e) => onChange(e.target.value)}
              onScroll={(e) => {
                syncScroll();
                onScroll?.(e as never);
              }}
              onClick={(e) => {
                inspectCaret();
                onClick?.(e as never);
              }}
              onSelect={() => inspectCaret()}
              onKeyUp={(e) => {
                inspectCaret();
                onKeyUp?.(e as never);
              }}
              onBlur={() => rememberInputSelection(innerRef.current)}
            />
          )}
        </div>
        {editing ? (
          <div className="absolute left-0 right-0 z-20 mt-2">
            <MergeTokenFallbackEditor
              token={editing}
              onFallbackChange={applyFallback}
              onClose={() => {
                editingRef.current = null;
                setEditing(null);
                innerRef.current?.focus();
              }}
            />
          </div>
        ) : null}
        <style>{`
          .merge-token-backdrop mark {
            background: rgba(194, 228, 240, 0.95);
            color: inherit;
            border-radius: 3px;
            font: inherit;
          }
          .merge-token-backdrop-dark mark {
            background: rgba(76, 155, 200, 0.45);
          }
        `}</style>
      </div>
    );
  }
);

MergeTokenTextField.displayName = "MergeTokenTextField";
