export type SmsSendConversation = {
  id: string;
  participantPhone?: string | null;
  title?: string | null;
  customer?: { id: string } | null;
};

export type SmsSendRecipient = {
  phone: string;
  name?: string;
  customerId?: string;
  userId?: string;
};

export type SmsSendTarget =
  | {
      ok: true;
      to: string;
      conversationId?: string;
      customerId?: string;
      title?: string;
      userId?: string;
    }
  | { ok: false; error: string };

/**
 * Destination for an SMS send.
 * An open thread always wins over leftover compose / deep-link recipient state.
 */
export function resolveSmsSendTarget(input: {
  conversationId: string | null;
  conversation: SmsSendConversation | null;
  recipient: SmsSendRecipient | null;
  initialCustomerId?: string | null;
}): SmsSendTarget {
  if (input.conversationId) {
    if (!input.conversation || input.conversation.id !== input.conversationId) {
      return { ok: false, error: "Conversation is still loading" };
    }
    const to = input.conversation.participantPhone?.trim();
    if (!to) {
      return { ok: false, error: "This conversation has no phone number" };
    }
    return {
      ok: true,
      to,
      conversationId: input.conversationId,
      customerId: input.conversation.customer?.id,
      title: input.conversation.title ?? undefined,
    };
  }

  const to = input.recipient?.phone?.trim();
  if (!to) {
    return { ok: false, error: "Select a recipient" };
  }

  return {
    ok: true,
    to,
    customerId: input.recipient?.customerId ?? input.initialCustomerId ?? undefined,
    title: input.recipient?.name,
    userId: input.recipient?.userId,
  };
}
