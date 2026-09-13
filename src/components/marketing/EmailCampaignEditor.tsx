"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Loader2, Maximize2, Minimize2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InsertVariableButton, applyTokenToInput } from "@/components/communications/InsertVariableButton";
import { MergeTokenTextField } from "@/components/communications/MergeTokenTextField";
import { useCompanyBrand } from "@/components/layout/CompanyBrandProvider";
import { buildCompanySignatureText } from "@/lib/inbox/company-email-signature";
import { htmlToPlainText } from "@/lib/marketing/link-tracking";
import {
  DEFAULT_CAMPAIGN_GREETING,
  campaignPlainBodyText,
  signatureFieldsFromCompany,
} from "@/lib/marketing/outbound-email";
import { cn } from "@/lib/utils";

type Props = {
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  aiPrompt: string;
  onSubjectChange: (subject: string) => void;
  onBodyChange: (html: string, text: string) => void;
  onAiPromptChange: (prompt: string) => void;
  defaultExpanded?: boolean;
  hideExpandToggle?: boolean;
  senderName?: string;
};

type CompanyContact = {
  phone: string | null;
  supportEmail: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

function seedPlainBody(html: string, text: string) {
  const existing = campaignPlainBodyText(html, text);
  return existing || `${DEFAULT_CAMPAIGN_GREETING}\n\n`;
}

function EmailCampaignEditorInner({
  subject,
  bodyHtml,
  bodyText = "",
  aiPrompt,
  onSubjectChange,
  onBodyChange,
  onAiPromptChange,
  defaultExpanded = true,
  hideExpandToggle = false,
  senderName,
}: Props) {
  const { brand } = useCompanyBrand();
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [companyContact, setCompanyContact] = useState<CompanyContact>({
    phone: null,
    supportEmail: null,
    website: null,
    address: null,
    city: null,
    state: null,
    zip: null,
  });
  const [companySenderName, setCompanySenderName] = useState("");
  const [testOpen, setTestOpen] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const subjectRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Keep the controlled value verbatim: normalization during typing removes spaces,
  // blank lines, and moves the caret. Seed the greeting only on initial mount.
  const plainDraft = seeded
    ? campaignPlainBodyText(bodyHtml, bodyText)
    : seedPlainBody(bodyHtml, bodyText);

  useEffect(() => {
    if (seeded) return;
    const next = seedPlainBody(bodyHtml, bodyText);
    if (next !== (bodyText || htmlToPlainText(bodyHtml))) {
      onBodyChange("", next);
    }
    setSeeded(true);
  }, [bodyHtml, bodyText, onBodyChange, seeded]);

  useEffect(() => {
    fetch("/api/settings/company/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setCompanyContact({
          phone: data.phone ?? null,
          supportEmail: data.supportEmail ?? null,
          website: data.website ?? null,
          address: data.address ?? null,
          city: data.city ?? null,
          state: data.state ?? null,
          zip: data.zip ?? null,
        });
        setCompanySenderName(
          (typeof data.emailSenderName === "string" && data.emailSenderName.trim()) ||
            (typeof data.name === "string" && data.name.trim()) ||
            ""
        );
      })
      .catch(() => {});
  }, []);

  function applyPlain(next: string) {
    onBodyChange("", next);
  }

  function insertIntoSubject(token: string) {
    const { next } = applyTokenToInput(subjectRef.current, subject, token);
    onSubjectChange(next);
  }

  function insertIntoBody(token: string) {
    const { next } = applyTokenToInput(bodyRef.current, plainDraft, token);
    applyPlain(next);
  }

  const signaturePreview = buildCompanySignatureText(
    signatureFieldsFromCompany({
      name: brand.companyName,
      ...companyContact,
    })
  );

  async function runAi() {
    if (!aiPrompt.trim()) {
      toast.error("Enter a prompt first");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/marketing/campaigns/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          subject,
          existingText: plainDraft.trim() || undefined,
          templateId: "plain",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI request failed");
      onSubjectChange(data.subject ?? subject);
      applyPlain(typeof data.bodyText === "string" ? data.bodyText : plainDraft);
      toast.success(plainDraft.trim() ? "Email updated" : "Email generated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI request failed");
    } finally {
      setGenerating(false);
    }
  }

  async function sendTestEmail() {
    const to = testTo.trim();
    if (!to) {
      toast.error("Enter an email address");
      return;
    }
    if (!subject.trim() && !plainDraft.trim()) {
      toast.error("Add a subject or email body first");
      return;
    }
    setSendingTest(true);
    try {
      const res = await fetch("/api/marketing/campaigns/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject,
          bodyHtml: "",
          bodyText: plainDraft,
          senderName,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to send test email");
      toast.success(`Test email sent to ${to}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send test email");
    } finally {
      setSendingTest(false);
    }
  }

  const hasExistingBody = Boolean(plainDraft.trim());

  return (
    <div
      className={cn(
        "space-y-4",
        expanded && "fixed inset-0 z-50 overflow-y-auto bg-background p-4 sm:p-6"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Email</h3>
          <p className="text-xs text-muted-foreground">
            A simple email — the same kind of message you’d type in Gmail. Company contact info and an
            unsubscribe link are added when it sends. Put links in as full URLs so we can track clicks.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {testOpen ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="email"
                autoFocus
                className="h-8 w-56"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="you@example.com"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void sendTestEmail();
                  }
                  if (e.key === "Escape") setTestOpen(false);
                }}
              />
              <Button type="button" size="sm" disabled={sendingTest} onClick={() => void sendTestEmail()}>
                {sendingTest ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                    Send
                  </>
                )}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={sendingTest} onClick={() => setTestOpen(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setTestOpen(true)}>
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Send test email
            </Button>
          )}
          {hideExpandToggle ? null : (
            <Button type="button" variant="outline" size="sm" onClick={() => setExpanded((v) => !v)}>
              {expanded ? (
                <>
                  <Minimize2 className="mr-1.5 h-3.5 w-3.5" />
                  Exit fullscreen
                </>
              ) : (
                <>
                  <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
                  Expand editor
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <div
        className={cn(
          "grid gap-4",
          expanded ? "lg:grid-cols-[280px_minmax(0,1fr)]" : "lg:grid-cols-[260px_minmax(0,1fr)]"
        )}
      >
        <div className="space-y-3 rounded-lg border bg-white p-4 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
          <h3 className="text-sm font-semibold">AI assistant</h3>
          <textarea
            className="min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            value={aiPrompt}
            onChange={(e) => onAiPromptChange(e.target.value)}
            placeholder={
              hasExistingBody
                ? "Describe edits: shorter, warmer tone…"
                : "Describe the email: offer, tone, what they should do next…"
            }
          />
          <Button type="button" className="w-full" onClick={() => void runAi()} disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Working…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                {hasExistingBody ? "Fill / edit with AI" : "Generate email"}
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground">
            Booking and other links come from{" "}
            <Link href="/settings/campaign-links" className="underline">
              Campaign links
            </Link>
            . Write them as full URLs in the message.
          </p>
        </div>

        <div className="flex min-h-0 flex-col gap-4">
          <div className="flex min-h-[min(70vh,720px)] flex-1 flex-col overflow-hidden rounded-lg border bg-white">
            <div className="border-b px-3 py-2">
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <p className="mt-1 text-sm text-foreground">
                {senderName?.trim() || companySenderName || brand.companyName}
              </p>
            </div>
            <div className="border-b px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-muted-foreground">Subject</label>
                <InsertVariableButton onInsert={insertIntoSubject} />
              </div>
              <MergeTokenTextField
                ref={subjectRef}
                multiline={false}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={subject}
                onChange={onSubjectChange}
                placeholder="Hi {customer_first_name}, a note from us"
              />
            </div>
            <div className="border-b px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Message</h3>
                <InsertVariableButton onInsert={insertIntoBody} />
              </div>
              <p className="text-xs text-muted-foreground">
                Starts with a greeting. Signature and unsubscribe are appended automatically — don’t paste
                HTML.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <MergeTokenTextField
                ref={bodyRef}
                className="min-h-[min(50vh,520px)] w-full resize-none border-0 px-4 py-3 text-sm leading-relaxed outline-none"
                value={plainDraft}
                onChange={applyPlain}
                placeholder={`${DEFAULT_CAMPAIGN_GREETING}\n\nWrite the rest of the email here…`}
              />
            </div>
            <div className="border-t bg-muted/30 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Added when it sends</p>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-foreground/80">
                {signaturePreview || brand.companyName}
              </pre>
              <span className="mt-4 inline-block text-xs text-muted-foreground underline">Unsubscribe</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const EmailCampaignEditor = dynamic(
  () => Promise.resolve({ default: EmailCampaignEditorInner }),
  {
    ssr: false,
    loading: () => <p className="text-sm text-muted-foreground">Loading editor...</p>,
  }
);
