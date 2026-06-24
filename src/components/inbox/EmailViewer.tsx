"use client";

import { useEffect, useState } from "react";
import { Archive, Download, Mail, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BlockContactAction } from "@/components/inbox/BlockContactAction";
import {
  EmailRecipientPicker,
  type EmailRecipient,
} from "@/components/inbox/EmailRecipientPicker";
import { InboxAttachmentPicker } from "@/components/inbox/InboxAttachmentPicker";
import { blobProxyUrl } from "@/lib/blob/urls";
import {
  isImageMimeType,
  plainTextToEmailHtml,
  sanitizeEmailHtml,
  type PendingAttachment,
} from "@/lib/inbox/attachments";
import type { CustomerTeamScope } from "@/lib/inbox/types";

type EmailAttachment = {
  id: string;
  blobUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number | null;
};

type EmailDetail = {
  id: string;
  fromEmail: string;
  toEmails: string[];
  subject: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  customer?: { id: string; name: string; email?: string | null } | null;
  attachments?: EmailAttachment[];
};

function EmailAttachmentList({ attachments }: { attachments: EmailAttachment[] }) {
  if (!attachments.length) return null;

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="mb-2 text-sm font-medium">Attachments</p>
      <ul className="space-y-2">
        {attachments.map((file) => {
          const href = blobProxyUrl(file.blobUrl) ?? file.blobUrl;
          return (
            <li key={file.id}>
              {isImageMimeType(file.mimeType) ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="block max-w-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={href}
                    alt={file.fileName}
                    className="max-h-48 rounded-md border border-border object-cover"
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">{file.fileName}</span>
                </a>
              ) : (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/50"
                >
                  <Download className="h-4 w-4" />
                  {file.fileName}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function EmailViewer({
  emailId,
  scope,
  onSent,
  initialTo,
  initialCustomerId,
  initialName,
}: {
  emailId: string | null;
  scope: CustomerTeamScope;
  onSent?: () => void;
  initialTo?: string | null;
  initialCustomerId?: string | null;
  initialName?: string | null;
}) {
  const [compose, setCompose] = useState(!emailId);
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [recipients, setRecipients] = useState<EmailRecipient[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!emailId && initialTo) {
      setRecipients([
        {
          email: initialTo,
          name: initialName ?? initialTo,
          customerId: initialCustomerId ?? undefined,
        },
      ]);
      setCompose(true);
    }
  }, [emailId, initialTo, initialName, initialCustomerId]);

  useEffect(() => {
    if (!emailId) {
      setEmail(null);
      setCompose(true);
      return;
    }
    setCompose(false);
    fetch(`/api/inbox/email/${emailId}`)
      .then((r) => r.json())
      .then(setEmail)
      .catch(() => {});
  }, [emailId]);

  async function updateFolder(folder: string) {
    if (!emailId) return;
    await fetch(`/api/inbox/email/${emailId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder }),
    });
    toast.success(`Moved to ${folder.toLowerCase()}`);
  }

  async function handleSend(saveAsDraft = false) {
    const toEmails = recipients.map((r) => r.email);
    if (!toEmails.length && !saveAsDraft) {
      toast.error("Select at least one recipient");
      return;
    }

    setSending(true);
    const res = await fetch("/api/inbox/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: toEmails,
        subject,
        bodyText: body,
        bodyHtml: body.trim() ? plainTextToEmailHtml(body) : undefined,
        attachments,
        scope: scope === "customers" ? "external" : "internal",
        saveAsDraft,
        customerId:
          initialCustomerId ??
          email?.customer?.id ??
          recipients.find((r) => r.customerId)?.customerId,
      }),
    });
    setSending(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to send email");
      return;
    }

    toast.success(saveAsDraft ? "Draft saved" : "Email sent");
    setRecipients([]);
    setSubject("");
    setBody("");
    setAttachments([]);
    onSent?.();
  }

  if (compose || !emailId) {
    return (
      <div className="flex h-full flex-col overflow-auto p-4">
        <h3 className="mb-4 shrink-0 font-semibold">
          {initialName ? `Email ${initialName}` : "Compose email"}
        </h3>
        <EmailRecipientPicker scope={scope} value={recipients} onChange={setRecipients} />
        <Input
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mb-2"
        />
        <textarea
          className="mb-3 min-h-[200px] flex-1 rounded-md border border-input p-3 text-sm"
          placeholder="Message... (URLs will become clickable links)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <InboxAttachmentPicker
          channel="email"
          attachments={attachments}
          onChange={setAttachments}
          className="mb-3"
        />
        <div className="flex shrink-0 gap-2">
          <Button
            onClick={() => handleSend(false)}
            disabled={sending || (!body.trim() && !attachments.length)}
          >
            <Send className="h-4 w-4" />
            Send
          </Button>
          <Button variant="outline" onClick={() => handleSend(true)} disabled={sending}>
            Save draft
          </Button>
        </div>
      </div>
    );
  }

  if (!email) {
    return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  }

  const htmlBody = email.bodyHtml ? sanitizeEmailHtml(email.bodyHtml) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between border-b border-border p-4">
        <div>
          <h3 className="text-lg font-semibold">{email.subject}</h3>
          <p className="text-sm text-muted-foreground">From: {email.fromEmail}</p>
          <p className="text-sm text-muted-foreground">To: {email.toEmails.join(", ")}</p>
        </div>
        <div className="flex gap-1">
          {scope === "customers" && email.customer && (
            <BlockContactAction
              customerId={email.customer.id}
              email={email.fromEmail}
              name={email.customer.name}
            />
          )}
          <Button variant="ghost" size="icon" onClick={() => updateFolder("ARCHIVE")}>
            <Archive className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => updateFolder("SPAM")}>
            <Mail className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => updateFolder("TRASH")}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {htmlBody ? (
          <div
            className="prose prose-sm max-w-none text-sm"
            dangerouslySetInnerHTML={{ __html: htmlBody }}
          />
        ) : (
          <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">
            {email.bodyText ?? ""}
          </div>
        )}
        <EmailAttachmentList attachments={email.attachments ?? []} />
      </div>
      <div className="border-t border-border p-4">
        <Button
          variant="outline"
          onClick={() => {
            setRecipients(
              email.toEmails.map((address) => ({
                email: address,
                name: address,
                customerId: email.customer?.id,
              }))
            );
            setSubject(email.subject.startsWith("Re:") ? email.subject : `Re: ${email.subject}`);
            setCompose(true);
          }}
        >
          Reply
        </Button>
      </div>
    </div>
  );
}
