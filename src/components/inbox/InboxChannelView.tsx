"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PenSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InboxChannelLayout } from "@/components/inbox/InboxChannelLayout";
import { SmsThreadList } from "@/components/inbox/SmsThreadList";
import { SmsMessagePane } from "@/components/inbox/SmsMessagePane";
import { CallHistoryList } from "@/components/inbox/CallHistoryList";
import { VoicePanel } from "@/components/inbox/VoicePanel";
import { EmailFolderNav } from "@/components/inbox/EmailFolderNav";
import { EmailList } from "@/components/inbox/EmailList";
import { EmailViewer } from "@/components/inbox/EmailViewer";
import type { InboxChannel, InboxScope, CustomerTeamScope, SocialScope } from "@/lib/inbox/types";
import { isCustomerTeamScope, parseInboxRoute } from "@/lib/inbox/types";
import { SocialDmMessagePane, SocialDmThreadList } from "@/components/inbox/SocialDmInbox";

export function InboxChannelView({
  channel,
  scope,
}: {
  channel: string;
  scope: string;
}) {
  const parsed = parseInboxRoute(channel, scope);
  const searchParams = useSearchParams();
  const deepLink = useMemo(
    () => ({
      customerId: searchParams.get("customerId"),
      phone: searchParams.get("phone"),
      email: searchParams.get("email"),
      name: searchParams.get("name"),
    }),
    [searchParams]
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [emailFolder, setEmailFolder] = useState("INBOX");
  const [refreshKey, setRefreshKey] = useState(0);

  const ch = parsed?.channel;
  const sc = parsed?.scope;

  useEffect(() => {
    if (!ch || !sc) return;
    if (ch !== "sms" || sc !== "customers") return;
    if (!deepLink.customerId && !deepLink.phone) return;

    const params = new URLSearchParams();
    if (deepLink.customerId) params.set("customerId", deepLink.customerId);
    if (deepLink.phone) params.set("phone", deepLink.phone);

    fetch(`/api/inbox/sms/conversations/resolve?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.conversation?.id) setSelectedId(data.conversation.id);
      })
      .catch(() => {});
  }, [ch, sc, deepLink.customerId, deepLink.phone]);

  if (!parsed || !ch || !sc) {
    return <div className="p-6">Invalid inbox route</div>;
  }

  if (ch === "social") {
    const platform = sc as SocialScope;
    return (
      <InboxChannelLayout
        channel={ch}
        scope={sc}
        list={<SocialDmThreadList platform={platform} />}
        detail={<SocialDmMessagePane platform={platform} conversationId={selectedId} />}
      />
    );
  }

  if (!isCustomerTeamScope(sc)) {
    return <div className="p-6">Invalid inbox route</div>;
  }

  const teamScope: CustomerTeamScope = sc;

  if (ch === "sms") {
    return (
      <div className="h-full w-full min-w-0">
        <InboxChannelLayout
          channel={ch}
          scope={sc}
          list={
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-border px-4 py-2">
                <span className="text-sm font-medium">Conversations</span>
                <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)}>
                  <PenSquare className="h-4 w-4" />
                </Button>
              </div>
              <SmsThreadList
                key={refreshKey}
                scope={teamScope}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
          }
          detail={
            <SmsMessagePane
              conversationId={selectedId}
              scope={teamScope}
              initialPhone={deepLink.phone}
              initialCustomerId={deepLink.customerId}
              initialName={deepLink.name}
              onSent={(id) => {
                setSelectedId(id);
                setRefreshKey((k) => k + 1);
              }}
            />
          }
        />
      </div>
    );
  }

  if (ch === "voice") {
    return (
      <InboxChannelLayout
        channel={ch}
        scope={sc}
        list={
          <CallHistoryList
            scope={teamScope}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        }
        detail={
          <VoicePanel
            scope={teamScope}
            selectedCallId={selectedId}
            initialPhone={deepLink.phone}
            initialCustomerId={deepLink.customerId}
            initialName={deepLink.name}
          />
        }
      />
    );
  }

  return (
    <InboxChannelLayout
      channel={ch as InboxChannel}
      scope={sc as InboxScope}
      list={
        <div className="flex h-full flex-col">
          <EmailFolderNav active={emailFolder} onChange={setEmailFolder} />
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="text-sm font-medium">Messages</span>
            <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)}>
              <PenSquare className="h-4 w-4" />
            </Button>
          </div>
          <EmailList
            key={`${emailFolder}-${refreshKey}`}
            scope={teamScope}
            folder={emailFolder}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
      }
      detail={
        <EmailViewer
          emailId={selectedId}
          scope={teamScope}
          onSent={() => setRefreshKey((k) => k + 1)}
          initialTo={deepLink.email}
          initialCustomerId={deepLink.customerId}
          initialName={deepLink.name}
        />
      }
    />
  );
}
