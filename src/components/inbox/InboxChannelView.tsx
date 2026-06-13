"use client";

import { useState } from "react";
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
import type { InboxChannel, InboxScope } from "@/lib/inbox/types";
import { parseInboxRoute } from "@/lib/inbox/types";

export function InboxChannelView({
  channel,
  scope,
}: {
  channel: string;
  scope: string;
}) {
  const parsed = parseInboxRoute(channel, scope);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [emailFolder, setEmailFolder] = useState("INBOX");
  const [refreshKey, setRefreshKey] = useState(0);

  if (!parsed) {
    return <div className="p-6">Invalid inbox route</div>;
  }

  const { channel: ch, scope: sc } = parsed;

  if (ch === "sms") {
    return (
      <InboxChannelLayout
        channel={ch}
        scope={sc}
        list={
          <SmsThreadList
            scope={sc}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        }
        detail={<SmsMessagePane conversationId={selectedId} scope={sc} />}
      />
    );
  }

  if (ch === "voice") {
    return (
      <InboxChannelLayout
        channel={ch}
        scope={sc}
        list={
          <CallHistoryList
            scope={sc}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        }
        detail={<VoicePanel scope={sc} selectedCallId={selectedId} />}
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
            scope={sc}
            folder={emailFolder}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
      }
      detail={
        <EmailViewer
          emailId={selectedId}
          scope={sc}
          onSent={() => setRefreshKey((k) => k + 1)}
        />
      }
    />
  );
}
