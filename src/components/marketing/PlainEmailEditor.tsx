"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from "react";
import { Bold, Italic, Underline } from "lucide-react";
import { Button } from "@/components/ui/button";
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
            <span className="ml-auto text-xs text-muted-foreground">
              Select text, then bold, italic, or underline
            </span>
            {actions}
        </div>
        <div
          ref={editorRef}
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label="Email message"
          data-placeholder={placeholder}
          className="min-h-[min(50vh,520px)] w-full px-4 py-3 text-sm leading-relaxed outline-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]"
          suppressContentEditableWarning
          onInput={emit}
        />
      </>
    );
  }
);
