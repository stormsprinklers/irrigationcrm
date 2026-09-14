"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmailCampaignEditor } from "@/components/marketing/EmailCampaignEditor";

type Props = {
  open: boolean;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  aiPrompt: string;
  onClose: () => void;
  onSubjectChange: (subject: string) => void;
  onAiPromptChange: (prompt: string) => void;
  onBodyChange: (html: string, text: string) => void;
  senderName?: string;
  onSenderNameChange?: (senderName: string) => void;
};

export function CampaignEmailEditorDialog({
  open,
  subject,
  bodyHtml,
  bodyText,
  aiPrompt,
  onClose,
  onSubjectChange,
  onAiPromptChange,
  onBodyChange,
  senderName,
  onSenderNameChange,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close email editor"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="campaign-email-editor-title"
        className="relative z-10 flex h-[min(96dvh,calc(100dvh-1.5rem))] w-full max-w-[90rem] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 id="campaign-email-editor-title" className="font-semibold">
              Email editor
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              {subject.trim() || "Untitled email"} — close when you are done to return to the canvas.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <EmailCampaignEditor
            subject={subject}
            bodyHtml={bodyHtml}
            bodyText={bodyText}
            aiPrompt={aiPrompt}
            defaultExpanded={false}
            hideExpandToggle
            onSubjectChange={onSubjectChange}
            onAiPromptChange={onAiPromptChange}
            onBodyChange={onBodyChange}
            senderName={senderName}
            onSenderNameChange={onSenderNameChange}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
