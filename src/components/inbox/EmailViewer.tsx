"use client";

import { useEffect, useState } from "react";
import { Archive, Mail, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BlockContactAction } from "@/components/inbox/BlockContactAction";
import type { InboxScope } from "@/lib/inbox/types";

type EmailDetail = {
  id: string;
  fromEmail: string;
  toEmails: string[];
  subject: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  customer?: { id: string; name: string; email?: string | null } | null;
};

export function EmailViewer({
  emailId,
  scope,
  onSent,
}: {
  emailId: string | null;
  scope: InboxScope;
  onSent?: () => void;
}) {
  const [compose, setCompose] = useState(!emailId);
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

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
    setSending(true);
    const res = await fetch("/api/inbox/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to,
        subject,
        bodyText: body,
        scope: scope === "customers" ? "external" : "internal",
        saveAsDraft,
      }),
    });
    setSending(false);

    if (!res.ok) {
      toast.error("Failed to send email");
      return;
    }

    toast.success(saveAsDraft ? "Draft saved" : "Email sent");
    setTo("");
    setSubject("");
    setBody("");
    onSent?.();
  }

  if (compose || !emailId) {
    return (
      <div className="flex h-full flex-col p-4">
        <h3 className="mb-4 font-semibold">Compose email</h3>
        <Input placeholder="To" value={to} onChange={(e) => setTo(e.target.value)} className="mb-2" />
        <Input
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mb-2"
        />
        <textarea
          className="mb-3 min-h-[200px] flex-1 rounded-md border border-input p-3 text-sm"
          placeholder="Message..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex gap-2">
          <Button onClick={() => handleSend(false)} disabled={sending}>
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
        <div className="prose prose-sm max-w-none text-sm whitespace-pre-wrap">
          {email.bodyText ?? email.bodyHtml ?? ""}
        </div>
      </div>
      <div className="border-t border-border p-4">
        <Button variant="outline" onClick={() => setCompose(true)}>
          Reply
        </Button>
      </div>
    </div>
  );
}
