"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { notifyInboxBadgesChanged } from "@/contexts/InboxBadgesProvider";
import { Send, AlertCircle, CheckCircle2, Copy, FileText, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AddContactInfoDialog } from "@/components/inbox/AddContactInfoDialog";
import { BlockContactAction } from "@/components/inbox/BlockContactAction";
import {
  SmsRecipientPicker,
  type SmsRecipient,
} from "@/components/inbox/SmsRecipientPicker";
import { CustomerNameWithBadge } from "@/components/customers/CustomerNameWithBadge";
import { InboxAttachmentPicker } from "@/components/inbox/InboxAttachmentPicker";
import { MessageMediaGallery, type MessageMediaItem } from "@/components/inbox/MessageMediaGallery";
import { formatPhoneDisplay } from "@/lib/inbox/phone";
import { formatSmsMessageTime } from "@/lib/inbox/message-time";
import {
  formatSmsDeliveryFailure,
  isSmsNotDelivered,
} from "@/lib/inbox/sms-delivery";
import { resolveSmsSendTarget } from "@/lib/inbox/sms-send-target";
import { parseEstimateSentActivity } from "@/lib/inbox/internal-activity";
import type { PendingAttachment } from "@/lib/inbox/attachments";
import { cn } from "@/lib/utils";
import { MergeTokenTextField } from "@/components/communications/MergeTokenTextField";
import type { CustomerTeamScope } from "@/lib/inbox/types";

type Message = {
  id: string;
  body: string;
  direction: "INBOUND" | "OUTBOUND";
  sentAt: string;
  deliveryStatus?: string | null;
  deliveryErrorCode?: string | null;
  deliveryError?: string | null;
  sender?: { name: string } | null;
  campaignName?: string | null;
  media?: MessageMediaItem[];
  contactInfoDetected?: boolean;
  contactInfoAppliedAt?: string | null;
};

type Conversation = {
  id: string;
  smsOpen?: boolean | null;
  smsClosedAt?: string | null;
  smsClosedBy?: { id: string; name: string } | null;
  lastMessageAt: string;
  participantPhone?: string | null;
  title?: string | null;
  customer?: {
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    doNotService?: boolean;
  } | null;
};

function ComposeBar({
  body,
  onBodyChange,
  onSubmit,
  sending,
  canSend = true,
  attachments,
  onAttachmentsChange,
  placeholder = "Type a message...",
  multiline = false,
}: {
  body: string;
  onBodyChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  sending: boolean;
  canSend?: boolean;
  attachments: PendingAttachment[];
  onAttachmentsChange: (attachments: PendingAttachment[]) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const submitDisabled = sending || !canSend || (!body.trim() && !attachments.length);

  function handleComposerKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>
  ) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;

    if ((event.shiftKey || event.ctrlKey) && multiline) {
      event.preventDefault();
      const field = event.currentTarget;
      const selectionStart = field.selectionStart ?? body.length;
      const selectionEnd = field.selectionEnd ?? selectionStart;
      const nextBody = `${body.slice(0, selectionStart)}\n${body.slice(selectionEnd)}`;
      onBodyChange(nextBody);
      requestAnimationFrame(() => {
        field.focus();
        field.setSelectionRange(selectionStart + 1, selectionStart + 1);
      });
      return;
    }

    if (event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    if (!submitDisabled) event.currentTarget.form?.requestSubmit();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex shrink-0 flex-col gap-2 border-t border-border bg-background p-4"
    >
      <InboxAttachmentPicker
        channel="sms"
        attachments={attachments}
        onChange={onAttachmentsChange}
      />
      <div className="flex items-end gap-2">
      {multiline ? (
        <MergeTokenTextField
          rows={3}
          className="min-h-[44px] w-full min-w-0 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder={placeholder}
          value={body}
          onChange={onBodyChange}
          onKeyDown={handleComposerKeyDown}
        />
      ) : (
        <MergeTokenTextField multiline={false}
          placeholder={placeholder}
          value={body}
          onChange={onBodyChange}
          onKeyDown={handleComposerKeyDown}
          className="min-h-[44px] w-full min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      )}
      <Button type="submit" size="icon" className="shrink-0" disabled={submitDisabled}>
        <Send className="h-4 w-4" />
      </Button>
      </div>
    </form>
  );
}

export function SmsMessagePane({
  conversationId,
  scope,
  initialPhone,
  initialCustomerId,
  initialName,
  onSent,
  spam = false,
  onMovedToSpam,
  onRestoredFromSpam,
  onConversationClosed,
  onConversationReopened,
}: {
  conversationId: string | null;
  scope: CustomerTeamScope;
  initialPhone?: string | null;
  initialCustomerId?: string | null;
  initialName?: string | null;
  onSent?: (conversationId: string) => void;
  spam?: boolean;
  onMovedToSpam?: () => void;
  onRestoredFromSpam?: () => void;
  onConversationClosed?: () => void;
  onConversationReopened?: () => void;
}) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [recipient, setRecipient] = useState<SmsRecipient | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [contactInfoMessageId, setContactInfoMessageId] = useState<string | null>(null);
  const [deliveryDetailMsg, setDeliveryDetailMsg] = useState<Message | null>(null);
  const [resending, setResending] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [closingConversation, setClosingConversation] = useState(false);
  const badgesNotifiedFor = useRef<string | null>(null);
  const smsOpenRef = useRef<boolean | null | undefined>(undefined);
  const onConversationReopenedRef = useRef(onConversationReopened);
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const messageContentRef = useRef<HTMLDivElement>(null);

  const isCompose = !conversationId;
  onConversationReopenedRef.current = onConversationReopened;

  useEffect(() => {
    setBody("");
    setAttachments([]);
    setContactInfoMessageId(null);
    setDeliveryDetailMsg(null);
    smsOpenRef.current = undefined;
  }, [conversationId]);

  useEffect(() => {
    if (conversationId) {
      setRecipient(null);
      return;
    }
    if (initialPhone || initialName) {
      setRecipient({
        phone: initialPhone ?? "",
        name: initialName ?? formatPhoneDisplay(initialPhone ?? ""),
        ...(initialCustomerId ? { customerId: initialCustomerId } : {}),
      });
    } else {
      setRecipient(null);
    }
  }, [conversationId, initialPhone, initialCustomerId, initialName]);

  useEffect(() => {
    if (!conversationId) {
      setConversation(null);
      setMessages([]);
      return;
    }

    let cancelled = false;
    setConversation(null);
    setMessages([]);

    async function load() {
      const res = await fetch(`/api/inbox/sms/conversations/${conversationId}/messages`);
      if (cancelled || !res.ok) return;
      const data = await res.json();
      if (cancelled) return;
      const reopenedWhileViewing =
        smsOpenRef.current === false && data.conversation?.smsOpen !== false;
      smsOpenRef.current = data.conversation?.smsOpen;
      setConversation(data.conversation);
      setMessages(
        data.messages.map((msg: Message & { contactInfoAppliedAt?: string | Date | null }) => ({
          ...msg,
          contactInfoAppliedAt: msg.contactInfoAppliedAt
            ? new Date(msg.contactInfoAppliedAt).toISOString()
            : null,
        }))
      );
      if (conversationId && badgesNotifiedFor.current !== conversationId) {
        badgesNotifiedFor.current = conversationId;
        notifyInboxBadgesChanged();
      }
      if (reopenedWhileViewing) onConversationReopenedRef.current?.();
    }
    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [conversationId]);

  const thread = conversation?.id === conversationId ? conversation : null;
  const threadMessages = thread ? messages : [];
  const loadedThreadId = thread?.id;

  useLayoutEffect(() => {
    if (!loadedThreadId) return;
    const viewport = messageScrollRef.current?.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]"
    );
    const content = messageContentRef.current;
    if (!viewport || !content) return;

    let followingLatest = true;
    const scrollToLatest = () => {
      if (followingLatest) viewport.scrollTop = viewport.scrollHeight;
    };
    const handleScroll = () => {
      followingLatest = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop < 64;
    };

    // Wait for this thread's messages to mount, and scroll only its viewport.
    scrollToLatest();
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    // New messages, loaded media, and viewport resizes can change the bottom.
    const observer = new ResizeObserver(scrollToLatest);
    observer.observe(content);
    observer.observe(viewport);
    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", handleScroll);
    };
  }, [loadedThreadId]);

  const canSend = conversationId
    ? Boolean(thread?.participantPhone)
    : Boolean(recipient?.phone);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() && !attachments.length) return;

    const target = resolveSmsSendTarget({
      conversationId,
      conversation: thread,
      recipient,
      initialCustomerId,
    });
    if (!target.ok) {
      toast.error(target.error);
      return;
    }

    setSending(true);
    const res = await fetch("/api/inbox/sms/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: target.to,
        conversationId: target.conversationId,
        body,
        media: attachments,
        customerId: target.customerId,
        userId: target.userId,
        title: target.title,
        scope: scope === "customers" ? "external" : "internal",
      }),
    });
    setSending(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to send message");
      return;
    }

    const data = await res.json();
    setBody("");
    setAttachments([]);
    setRecipient(null);
    toast.success("Message sent");
    notifyInboxBadgesChanged();
    onSent?.(data.conversation.id);
  }

  const displayPhone = thread?.participantPhone
    ? formatPhoneDisplay(thread.participantPhone)
    : isCompose && recipient?.phone
      ? formatPhoneDisplay(recipient.phone)
      : isCompose && initialPhone
        ? formatPhoneDisplay(initialPhone)
        : null;

  const displayName = thread
    ? thread.customer?.name ?? thread.title ?? null
    : isCompose
      ? recipient?.name ?? initialName ?? null
      : null;

  const headerTitle =
    displayName ?? displayPhone ?? (conversationId ? "Conversation" : "New message");

  const headerSubtitle =
    displayName && displayPhone && displayName !== displayPhone ? displayPhone : null;

  const blockPhone =
    thread?.participantPhone ?? thread?.customer?.phone ?? null;
  const showBlockAction =
    scope === "customers" && !spam && Boolean(conversationId) && Boolean(blockPhone);

  async function closeConversation() {
    if (!conversationId || !thread) return;
    setClosingConversation(true);
    try {
      const res = await fetch(`/api/inbox/sms/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ open: false, lastMessageAt: thread.lastMessageAt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not close this conversation");
        return;
      }
      setConversation((current) =>
        current?.id === conversationId
          ? { ...current, ...data.conversation }
          : current
      );
      smsOpenRef.current = false;
      notifyInboxBadgesChanged();
      toast.success("Conversation closed");
      onConversationClosed?.();
    } catch {
      toast.error("Could not close this conversation");
    } finally {
      setClosingConversation(false);
    }
  }

  async function reopenConversation() {
    if (!conversationId || !thread) return;
    setClosingConversation(true);
    try {
      const res = await fetch(`/api/inbox/sms/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ open: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Could not reopen this conversation");
        return;
      }
      setConversation((current) =>
        current?.id === conversationId
          ? { ...current, ...data.conversation }
          : current
      );
      smsOpenRef.current = true;
      notifyInboxBadgesChanged();
      toast.success("Conversation reopened");
      onConversationReopened?.();
    } catch {
      toast.error("Could not reopen this conversation");
    } finally {
      setClosingConversation(false);
    }
  }

  function PhoneRow({
    phone,
    className,
  }: {
    phone: string;
    className?: string;
  }) {
    return (
      <div className="flex min-w-0 items-center gap-0.5">
        <p className={cn("truncate text-xs text-muted-foreground", className)}>{phone}</p>
        {showBlockAction ? (
          <BlockContactAction
            inline
            customerId={thread?.customer?.id}
            phone={blockPhone}
            email={thread?.customer?.email}
            name={thread?.customer?.name ?? phone}
            spam
            onBlocked={onMovedToSpam}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          {thread?.customer?.name ? (
            <>
              <CustomerNameWithBadge
                name={thread.customer.name}
                doNotService={thread.customer.doNotService}
                nameClassName="truncate font-semibold"
              />
              {displayPhone ? <PhoneRow phone={displayPhone} /> : null}
            </>
          ) : (
            <>
              {displayPhone && showBlockAction && !displayName ? (
                <div className="flex min-w-0 items-center gap-1">
                  <h3 className="truncate font-semibold">{displayPhone}</h3>
                  <BlockContactAction
                    inline
                    phone={blockPhone}
                    name={displayPhone}
                    spam
                    onBlocked={onMovedToSpam}
                  />
                </div>
              ) : (
                <h3 className="truncate font-semibold">{headerTitle}</h3>
              )}
              {headerSubtitle ? <PhoneRow phone={headerSubtitle} /> : null}
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {scope === "customers" && !spam && thread?.smsOpen === true ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={closingConversation}
              onClick={() => void closeConversation()}
            >
              <CheckCircle2 className="h-4 w-4" />
              {closingConversation ? "Closing…" : "Mark closed"}
            </Button>
          ) : null}
          {spam && blockPhone && (
            <Button type="button" variant="outline" size="sm" disabled={restoring} onClick={async () => {
            setRestoring(true);
            try {
              const res = await fetch(`/api/inbox/block?phone=${encodeURIComponent(blockPhone)}`, { method: "DELETE" });
              if (!res.ok) throw new Error("Could not restore this number");
              toast.success("Moved to inbox");
              onRestoredFromSpam?.();
            } catch {
              toast.error("Could not restore this number");
            } finally {
              setRestoring(false);
            }
          }}>
            {restoring ? "Restoring…" : "Unblock and move to inbox"}
            </Button>
          )}
        </div>
      </div>

      {scope === "customers" && !spam && thread?.smsOpen === false ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          <span>
            {thread.smsClosedBy?.name && thread.smsClosedAt
              ? `Closed by ${thread.smsClosedBy.name} on ${new Date(thread.smsClosedAt).toLocaleString()}`
              : "This conversation is closed."}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={closingConversation}
            onClick={() => void reopenConversation()}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {closingConversation ? "Reopening…" : "Reopen"}
          </Button>
        </div>
      ) : null}

      {isCompose && (
        <div className="shrink-0 border-b border-border px-4 py-3">
          <SmsRecipientPicker scope={scope} value={recipient} onChange={setRecipient} />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden bg-muted/20">
        <ScrollArea ref={messageScrollRef} className="h-full w-full">
          <div ref={messageContentRef} className="flex min-h-full flex-col p-4">
            {threadMessages.length > 0 ? (
              <div className="space-y-3">
                {threadMessages.map((msg) => {
                  const estimateActivity = parseEstimateSentActivity(msg.deliveryStatus);
                  const attribution =
                    msg.direction === "OUTBOUND"
                      ? msg.campaignName ? `Campaign: ${msg.campaignName}` : msg.sender?.name ?? "Team"
                      : scope === "customers"
                        ? thread?.customer?.name ??
                          (thread?.participantPhone
                            ? formatPhoneDisplay(thread.participantPhone)
                            : "Customer")
                        : thread?.title ??
                          (thread?.participantPhone
                            ? formatPhoneDisplay(thread.participantPhone)
                          : "Team member");

                  if (estimateActivity) {
                    return (
                      <div key={msg.id} className="flex justify-center py-1">
                        <Link
                          href={`/estimates/${estimateActivity.estimateId}`}
                          className="group flex max-w-[92%] items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          <span className="font-medium text-foreground group-hover:text-primary">
                            {msg.body}
                          </span>
                          <span className="opacity-70">· {formatSmsMessageTime(msg.sentAt)}</span>
                        </Link>
                      </div>
                    );
                  }

                  return (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex max-w-[85%] flex-col gap-1.5",
                      msg.direction === "OUTBOUND" ? "ml-auto items-end" : "items-start"
                    )}
                  >
                    <div
                      className={cn(
                        "select-text rounded-2xl px-4 py-2 text-sm",
                        msg.direction === "OUTBOUND"
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-muted text-foreground shadow-sm"
                      )}
                    >
                      {msg.body && msg.body !== "[Media message]" ? (
                        <p className="select-text whitespace-pre-wrap break-words">{msg.body}</p>
                      ) : null}
                      <MessageMediaGallery media={msg.media ?? []} />
                      <div
                        className={cn(
                          "mt-1 flex items-center gap-1 text-[10px] leading-snug",
                          msg.direction === "OUTBOUND"
                            ? "justify-end text-primary-foreground/70"
                            : "text-muted-foreground"
                        )}
                      >
                        <p>
                          <span className="font-medium">{attribution}</span>
                          <span className="opacity-70"> · {formatSmsMessageTime(msg.sentAt)}</span>
                        </p>
                        {msg.body && msg.body !== "[Media message]" ? (
                          <button
                            type="button"
                            className="rounded p-0.5 opacity-70 hover:opacity-100"
                            aria-label="Copy message"
                            title="Copy message"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(msg.body);
                                toast.success("Message copied");
                              } catch {
                                toast.error("Could not copy message");
                              }
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {msg.direction === "OUTBOUND" && isSmsNotDelivered(msg.deliveryStatus) ? (
                      <button
                        type="button"
                        className="flex items-center gap-1 px-1 text-[11px] font-medium text-destructive underline-offset-2 hover:underline"
                        onClick={() => setDeliveryDetailMsg(msg)}
                      >
                        <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
                        {msg.deliveryStatus?.toLowerCase() === "undelivered"
                          ? "Not delivered"
                          : "Failed to send"}
                        <span className="font-normal no-underline opacity-80">· Why?</span>
                      </button>
                    ) : null}

                    {scope === "customers" &&
                    msg.direction === "INBOUND" &&
                    msg.contactInfoDetected ? (
                      <div className="flex flex-col items-start gap-1 px-1">
                        {msg.contactInfoAppliedAt ? (
                          <span className="text-[10px] font-medium text-green-700 dark:text-green-300">
                            Contact info added
                          </span>
                        ) : (
                          <>
                            <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300">
                              Contact info detected
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 border-amber-300 bg-amber-50 text-xs text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200 dark:hover:bg-amber-900/50"
                              onClick={() => setContactInfoMessageId(msg.id)}
                            >
                              + Add contact info
                            </Button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center py-12 text-center text-sm text-muted-foreground">
                {conversationId
                  ? "No messages in this conversation yet."
                  : "Select a recipient and compose a message below."}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {!spam && <ComposeBar
        body={body}
        onBodyChange={setBody}
        onSubmit={handleSend}
        sending={sending}
        canSend={canSend}
        attachments={attachments}
        onAttachmentsChange={setAttachments}
        multiline
      />}

      {contactInfoMessageId ? (
        <AddContactInfoDialog
          open
          messageId={contactInfoMessageId}
          onClose={() => setContactInfoMessageId(null)}
          onApplied={(customer) => {
            setConversation((prev) =>
              prev && prev.id === conversationId
                ? { ...prev, customer: { ...customer, doNotService: prev.customer?.doNotService } }
                : prev
            );
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === contactInfoMessageId
                  ? { ...msg, contactInfoAppliedAt: new Date().toISOString() }
                  : msg
              )
            );
          }}
        />
      ) : null}

      {deliveryDetailMsg ? (
        <DeliveryFailureDialog
          message={deliveryDetailMsg}
          busy={resending}
          onClose={() => setDeliveryDetailMsg(null)}
          onResend={async () => {
            setResending(true);
            try {
              const res = await fetch(
                `/api/inbox/sms/messages/${deliveryDetailMsg.id}/resend`,
                { method: "POST" }
              );
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                toast.error(typeof data.error === "string" ? data.error : "Resend failed");
                return;
              }
              toast.success("Message sent again");
              setDeliveryDetailMsg(null);
              if (conversationId) {
                const refresh = await fetch(
                  `/api/inbox/sms/conversations/${conversationId}/messages`
                );
                if (refresh.ok) {
                  const payload = await refresh.json();
                  setMessages(payload.messages ?? []);
                }
              }
              if (data.message?.conversationId) {
                onSent?.(data.message.conversationId);
              } else if (conversationId) {
                onSent?.(conversationId);
              }
            } finally {
              setResending(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function DeliveryFailureDialog({
  message,
  busy,
  onClose,
  onResend,
}: {
  message: Message;
  busy: boolean;
  onClose: () => void;
  onResend: () => void;
}) {
  const failure = formatSmsDeliveryFailure(message);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sms-delivery-title"
        className="w-full max-w-md rounded-lg border border-border bg-card p-5 text-card-foreground shadow-lg"
      >
        <h2 id="sms-delivery-title" className="flex items-center gap-2 text-base font-semibold">
          <AlertCircle className="h-4 w-4 text-destructive" aria-hidden />
          {failure.title}
        </h2>
        <p className="mt-3 text-sm text-foreground">{failure.detail}</p>
        {failure.hint ? (
          <p className="mt-2 text-sm text-muted-foreground">{failure.hint}</p>
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground">
          Outbound inbox texts send from this company&apos;s Primary phone number. “SMS enabled” on
          a number only means Twilio lists SMS capability — the number also needs to be on your A2P
          Messaging Service for US delivery.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Close
          </Button>
          <Button type="button" disabled={busy} onClick={onResend}>
            {busy ? "Sending…" : "Try sending again"}
          </Button>
        </div>
      </div>
    </div>
  );
}
