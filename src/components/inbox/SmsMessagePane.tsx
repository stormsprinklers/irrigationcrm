"use client";

import { useEffect, useRef, useState } from "react";
import { notifyInboxBadgesChanged } from "@/contexts/InboxBadgesProvider";
import { Send, AlertCircle } from "lucide-react";
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
import type { PendingAttachment } from "@/lib/inbox/attachments";
import { cn } from "@/lib/utils";
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
  media?: MessageMediaItem[];
  contactInfoDetected?: boolean;
  contactInfoAppliedAt?: string | null;
};

type Conversation = {
  id: string;
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
  attachments,
  onAttachmentsChange,
  placeholder = "Type a message...",
  multiline = false,
}: {
  body: string;
  onBodyChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  sending: boolean;
  attachments: PendingAttachment[];
  onAttachmentsChange: (attachments: PendingAttachment[]) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="flex shrink-0 flex-col gap-2 border-t border-border bg-white p-4"
    >
      <InboxAttachmentPicker
        channel="sms"
        attachments={attachments}
        onChange={onAttachmentsChange}
      />
      <div className="flex items-end gap-2">
      {multiline ? (
        <textarea
          rows={3}
          className="min-h-[44px] w-full min-w-0 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder={placeholder}
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
        />
      ) : (
        <input
          placeholder={placeholder}
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          className="min-h-[44px] w-full min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      )}
      <Button type="submit" size="icon" className="shrink-0" disabled={sending || (!body.trim() && !attachments.length)}>
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
}: {
  conversationId: string | null;
  scope: CustomerTeamScope;
  initialPhone?: string | null;
  initialCustomerId?: string | null;
  initialName?: string | null;
  onSent?: (conversationId: string) => void;
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
  const badgesNotifiedFor = useRef<string | null>(null);

  const isCompose = !conversationId;

  useEffect(() => {
    if (conversationId) return;
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

    async function load() {
      const res = await fetch(`/api/inbox/sms/conversations/${conversationId}/messages`);
      if (res.ok) {
        const data = await res.json();
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
      }
    }
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [conversationId]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() && !attachments.length) return;

    const toPhone = recipient?.phone ?? conversation?.participantPhone;
    if (!toPhone?.trim()) {
      toast.error("Select a recipient");
      return;
    }

    setSending(true);
    const res = await fetch("/api/inbox/sms/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: toPhone,
        body,
        media: attachments,
        customerId: recipient?.customerId ?? conversation?.customer?.id ?? initialCustomerId ?? undefined,
        userId: recipient?.userId,
        title: recipient?.name ?? conversation?.title ?? undefined,
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
    toast.success("Message sent");
    onSent?.(data.conversation.id);
  }

  const displayPhone = conversation?.participantPhone
    ? formatPhoneDisplay(conversation.participantPhone)
    : recipient?.phone
      ? formatPhoneDisplay(recipient.phone)
      : initialPhone && isCompose
        ? formatPhoneDisplay(initialPhone)
        : null;

  const displayName =
    conversation?.customer?.name ??
    recipient?.name ??
    conversation?.title ??
    (initialName && !conversationId ? initialName : null) ??
    null;

  const headerTitle =
    displayName ?? displayPhone ?? (conversationId ? "Conversation" : "New message");

  const headerSubtitle =
    displayName && displayPhone && displayName !== displayPhone ? displayPhone : null;

  const blockPhone =
    conversation?.customer?.phone ?? conversation?.participantPhone ?? null;
  const showBlockAction =
    scope === "customers" && Boolean(conversationId) && Boolean(blockPhone);

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
            customerId={conversation?.customer?.id}
            phone={blockPhone}
            email={conversation?.customer?.email}
            name={conversation?.customer?.name ?? phone}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          {conversation?.customer?.name ? (
            <>
              <CustomerNameWithBadge
                name={conversation.customer.name}
                doNotService={conversation.customer.doNotService}
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
                  />
                </div>
              ) : (
                <h3 className="truncate font-semibold">{headerTitle}</h3>
              )}
              {headerSubtitle ? <PhoneRow phone={headerSubtitle} /> : null}
            </>
          )}
        </div>
      </div>

      {isCompose && (
        <div className="shrink-0 border-b border-border px-4 py-3">
          <SmsRecipientPicker scope={scope} value={recipient} onChange={setRecipient} />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden bg-muted/20">
        <ScrollArea className="h-full w-full">
          <div className="flex min-h-full flex-col p-4">
            {messages.length > 0 ? (
              <div className="space-y-3">
                {messages.map((msg) => {
                  const attribution =
                    msg.direction === "OUTBOUND"
                      ? msg.sender?.name ?? "Team"
                      : scope === "customers"
                        ? conversation?.customer?.name ??
                          (conversation?.participantPhone
                            ? formatPhoneDisplay(conversation.participantPhone)
                            : "Customer")
                        : conversation?.title ??
                          (conversation?.participantPhone
                            ? formatPhoneDisplay(conversation.participantPhone)
                            : "Team member");

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
                        "rounded-2xl px-4 py-2 text-sm",
                        msg.direction === "OUTBOUND"
                          ? "bg-primary text-white"
                          : "bg-white text-foreground shadow-sm"
                      )}
                    >
                      {msg.body && msg.body !== "[Media message]" ? (
                        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                      ) : null}
                      <MessageMediaGallery media={msg.media ?? []} />
                      <p
                        className={cn(
                          "mt-1 text-[10px] leading-snug",
                          msg.direction === "OUTBOUND"
                            ? "text-right text-white/70"
                            : "text-muted-foreground"
                        )}
                      >
                        <span className="font-medium">{attribution}</span>
                        <span className="opacity-70"> · {formatSmsMessageTime(msg.sentAt)}</span>
                      </p>
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
                          <span className="text-[10px] font-medium text-green-700">
                            Contact info added
                          </span>
                        ) : (
                          <>
                            <span className="text-[10px] font-medium text-amber-700">
                              Contact info detected
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 border-amber-300 bg-amber-50 text-xs text-amber-900 hover:bg-amber-100"
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

      <ComposeBar
        body={body}
        onBodyChange={setBody}
        onSubmit={handleSend}
        sending={sending}
        attachments={attachments}
        onAttachmentsChange={setAttachments}
        multiline
      />

      {contactInfoMessageId ? (
        <AddContactInfoDialog
          open
          messageId={contactInfoMessageId}
          onClose={() => setContactInfoMessageId(null)}
          onApplied={(customer) => {
            setConversation((prev) =>
              prev ? { ...prev, customer: { ...customer, doNotService: prev.customer?.doNotService } } : prev
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
        className="w-full max-w-md rounded-lg border border-border bg-white p-5 shadow-lg"
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
