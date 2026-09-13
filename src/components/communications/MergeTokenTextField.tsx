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
import { useWritingSuggestions } from "./useWritingSuggestions";
import { applyWritingIssue, type WritingIssue } from "@/lib/communications/proofreading";

type CommonProps = {
  value: string;
  onChange: (value: string) => void;
  tone?: "light" | "dark";
  multiline?: boolean;
  className?: string;
  proofreading?: boolean;
};

type Props = CommonProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement> & InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className">;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightMergeTokens(value: string, issues: WritingIssue[]) {
  const tokens = [...parseMergeTokens(value).map((t) => ({ ...t, kind: "token" })), ...issues.map((i) => ({ ...i, raw: i.original }))].sort((a,b) => a.start-b.start);
  if (tokens.length === 0) return escapeHtml(value);
  let html = "";
  let cursor = 0;
  for (const token of tokens) {
    html += escapeHtml(value.slice(cursor, token.start));
    html += token.kind === "token" ? `<mark>${escapeHtml(token.raw)}</mark>` : `<span class="writing-${token.kind}">${escapeHtml(token.raw)}</span>`;
    cursor = token.end;
  }
  html += escapeHtml(value.slice(cursor));
  return html;
}

export const MergeTokenTextField = forwardRef<HTMLTextAreaElement | HTMLInputElement, Props>(
  function MergeTokenTextField(
    { value, onChange, className, tone = "light", multiline = true, proofreading = true, onClick, onKeyUp, onScroll, onFocus, onCompositionStart, onCompositionEnd, ...rest },
    ref
  ) {
    const innerRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
    const backdropRef = useRef<HTMLDivElement | null>(null);
    const editingRef = useRef<ParsedMergeToken | null>(null);
    const valueRef = useRef(value);
    valueRef.current = value;
    const [editing, setEditing] = useState<ParsedMergeToken | null>(null);
    const [writingActive, setWritingActive] = useState(false);
    const [composing, setComposing] = useState(false);
    const [suggestionsOpen, setSuggestionsOpen] = useState(false);
    const writing = useWritingSuggestions(value, proofreading && writingActive && !composing);

    function applySuggestion(issue: WritingIssue) {
      const next = applyWritingIssue(valueRef.current, issue);
      if (next === valueRef.current) return;
      onChange(next);
      setSuggestionsOpen(false);
      requestAnimationFrame(() => {
        innerRef.current?.focus();
        const caret = issue.start + issue.replacement.length;
        innerRef.current?.setSelectionRange(caret, caret);
      });
    }
    const writingProps = {
      lang: "en-US",
      spellCheck: !proofreading,
      onFocus: (event: React.FocusEvent<HTMLTextAreaElement | HTMLInputElement>) => { setWritingActive(true); onFocus?.(event as never); },
      onCompositionStart: (event: React.CompositionEvent<HTMLTextAreaElement | HTMLInputElement>) => { setComposing(true); onCompositionStart?.(event as never); },
      onCompositionEnd: (event: React.CompositionEvent<HTMLTextAreaElement | HTMLInputElement>) => { setComposing(false); onCompositionEnd?.(event as never); },
    };

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
      setSuggestionsOpen(writing.issues.some((issue) => pos >= issue.start && pos <= issue.end));
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
      proofreading && "pr-12",
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
      proofreading && "pr-12",
      tone === "dark" ? "text-slate-100" : "text-foreground"
    );

    return (
      <div className={cn("relative", className, "block border-0 p-0 shadow-none ring-0 resize-none")}>
        <div className="relative overflow-hidden rounded-[inherit]">
          <div
            ref={backdropRef}
            aria-hidden
            className={backdropClassName}
            dangerouslySetInnerHTML={{ __html: highlightMergeTokens(value, writing.issues) + (multiline ? "\n" : "") }}
          />
          {multiline ? (
            <textarea
              {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
              {...writingProps}
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
              onSelect={() => rememberInputSelection(innerRef.current)}
              onKeyUp={(e) => {
                rememberInputSelection(innerRef.current);
                onKeyUp?.(e as never);
              }}
              onBlur={() => rememberInputSelection(innerRef.current)}
            />
          ) : (
            <input
              {...(rest as InputHTMLAttributes<HTMLInputElement>)}
              {...writingProps}
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
              onSelect={() => rememberInputSelection(innerRef.current)}
              onKeyUp={(e) => {
                rememberInputSelection(innerRef.current);
                onKeyUp?.(e as never);
              }}
              onBlur={() => rememberInputSelection(innerRef.current)}
            />
          )}
        </div>
        {proofreading && writingActive ? <button type="button" className="absolute right-1 top-1 z-10 rounded border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground" title={writing.status || "English spelling and grammar"} aria-label="English writing suggestions" aria-expanded={suggestionsOpen} onClick={() => setSuggestionsOpen((v) => !v)}>EN{writing.issues.length ? ` · ${writing.issues.length}` : ""}</button> : null}
        {suggestionsOpen ? <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 space-y-2 overflow-auto rounded-lg border bg-background p-3 text-sm shadow-lg">
          <div className="flex justify-between gap-2"><p role="status">{writing.status}</p><button type="button" onClick={() => setSuggestionsOpen(false)} aria-label="Close writing suggestions">×</button></div>
          <p className="text-xs text-muted-foreground">Red: spelling · Blue: grammar. Suggestions never change your draft automatically.</p>
          {writing.issues.map((issue) => <div key={`${issue.start}:${issue.end}`} className="border-t pt-2"><p className="text-xs font-medium">{issue.kind === "spelling" ? "Spelling" : "Grammar"}: {issue.explanation}</p><p className="my-1 text-xs">{issue.original} → {issue.replacement || "(remove)"}</p><div className="flex gap-3"><button type="button" className="text-primary underline" onClick={() => applySuggestion(issue)}>Apply</button><button type="button" className="text-muted-foreground underline" onClick={() => writing.dismiss(issue)}>Ignore</button></div></div>)}
        </div> : null}
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
          .writing-spelling { text-decoration: underline wavy #dc2626; text-underline-offset: 3px; text-decoration-thickness: 1.5px; }
          .writing-grammar { text-decoration: underline wavy #2563eb; text-underline-offset: 3px; text-decoration-thickness: 1.5px; }
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
