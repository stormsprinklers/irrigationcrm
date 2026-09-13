"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { Bold, Italic, Link2, Underline } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { emailAnchorHtml, sanitizeEmailHref } from "@/lib/marketing/email-href";
import { unwrapPlainEmailHtml, wrapPlainEmailHtml } from "@/lib/marketing/email-templates";

export type PlainEmailEditorHandle = {
  insertMergeToken: (token: string) => void;
};

type Props = {
  html: string;
  onChange: (html: string) => void;
  placeholder?: string;
  actions?: ReactNode;
};

export const PlainEmailEditor = forwardRef<PlainEmailEditorHandle, Props>(
  function PlainEmailEditor({ html, onChange, placeholder, actions }, ref) {
    const editorRef = useRef<HTMLDivElement>(null);
    const lastEmitted = useRef(html);
    const ready = useRef(false);
    const savedRange = useRef<Range | null>(null);
    const [linkOpen, setLinkOpen] = useState(false);
    const [linkText, setLinkText] = useState("click here");
    const [linkHref, setLinkHref] = useState("https://");

    useEffect(() => {
      const el = editorRef.current;
      if (!el) return;
      if (!ready.current) {
        ready.current = true;
        lastEmitted.current = html;
        el.innerHTML = unwrapPlainEmailHtml(html);
        return;
      }
      if (html === lastEmitted.current) return;
      lastEmitted.current = html;
      el.innerHTML = unwrapPlainEmailHtml(html);
    }, [html]);

    function emit() {
      const el = editorRef.current;
      if (!el) return;
      const next = wrapPlainEmailHtml(el.innerHTML);
      lastEmitted.current = next;
      onChange(next);
    }

    function run(command: "bold" | "italic" | "underline") {
      editorRef.current?.focus();
      document.execCommand(command, false);
      emit();
    }

    function rememberSelection() {
      const el = editorRef.current;
      const sel = window.getSelection();
      if (!el || !sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
        savedRange.current = null;
        return;
      }
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }

    function restoreSelection() {
      const el = editorRef.current;
      const range = savedRange.current;
      if (!el) return;
      el.focus();
      if (!range) return;
      const sel = window.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      sel.addRange(range);
    }

    function selectedLink(): HTMLAnchorElement | null {
      const range = savedRange.current;
      const node = range?.commonAncestorContainer;
      if (!node) return null;
      const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      return el?.closest("a") ?? null;
    }

    function openLinkDialog() {
      rememberSelection();
      const existing = selectedLink();
      const selected = savedRange.current && !savedRange.current.collapsed
        ? savedRange.current.toString()
        : "";
      setLinkText(existing?.textContent?.trim() || selected.trim() || "click here");
      setLinkHref(existing?.getAttribute("href") || "https://");
      setLinkOpen(true);
    }

    function applyLink() {
      const href = sanitizeEmailHref(linkHref);
      if (!href) return;
      restoreSelection();
      const existing = selectedLink();
      const label = linkText.trim() || href;
      if (existing) {
        existing.setAttribute("href", href);
        existing.textContent = label;
        existing.setAttribute("style", "color:#1d4ed8;text-decoration:underline");
      } else {
        const markup = emailAnchorHtml(href, label);
        if (!markup) return;
        const range = savedRange.current;
        if (range && !range.collapsed) {
          document.execCommand("createLink", false, href);
          const sel = window.getSelection();
          const node = sel?.anchorNode;
          const a =
            (node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement)?.closest(
              "a"
            ) ?? null;
          if (a) {
            a.setAttribute("href", href);
            a.setAttribute("style", "color:#1d4ed8;text-decoration:underline");
            if (a.textContent?.trim() !== label) a.textContent = label;
          }
        } else {
          document.execCommand("insertHTML", false, markup);
        }
      }
      emit();
      setLinkOpen(false);
    }

    useImperativeHandle(ref, () => ({
      insertMergeToken(token: string) {
        const el = editorRef.current;
        if (!el) return;
        el.focus();
        document.execCommand("insertText", false, token);
        emit();
      },
    }));

    return (
      <>
        <div className="flex items-center gap-1 border-b px-3 py-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label="Bold"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => run("bold")}
          >
            <Bold className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label="Italic"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => run("italic")}
          >
            <Italic className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label="Underline"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => run("underline")}
          >
            <Underline className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label="Insert link"
            onMouseDown={(event) => event.preventDefault()}
            onClick={openLinkDialog}
          >
            <Link2 className="mr-1 h-3.5 w-3.5" />
            Link
          </Button>
          {actions ? <div className="ml-auto">{actions}</div> : null}
        </div>
        <div
          ref={editorRef}
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label="Email message"
          data-placeholder={placeholder}
          className="min-h-[min(50vh,520px)] w-full px-4 py-3 text-sm leading-relaxed outline-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_a]:text-blue-700 [&_a]:underline"
          suppressContentEditableWarning
          onInput={emit}
        />
        {linkOpen ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-lg border bg-white p-4 shadow-lg">
              <h3 className="text-sm font-semibold">Insert link</h3>
              <label className="mt-3 block text-xs text-muted-foreground">Link text</label>
              <Input
                className="mt-1"
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                placeholder="click here"
                autoFocus
              />
              <label className="mt-3 block text-xs text-muted-foreground">URL</label>
              <Input
                className="mt-1"
                value={linkHref}
                onChange={(e) => setLinkHref(e.target.value)}
                placeholder="https://www.stormsprinklers.com/booking"
              />
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setLinkOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={applyLink} disabled={!sanitizeEmailHref(linkHref)}>
                  Save link
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }
);
