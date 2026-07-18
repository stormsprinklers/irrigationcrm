"use client";

import { useState } from "react";
import { InboxListDetailShell } from "@/components/inbox/InboxListDetailShell";
import {
  SocialDmMessagePane,
  SocialDmThreadList,
} from "@/components/inbox/SocialDmInbox";
import type { SocialScope } from "@/lib/inbox/types";

export function SocialDmCombinedView() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<SocialScope | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <InboxListDetailShell
      chrome={
        <p className="text-xs text-muted-foreground">
          Inbox &gt; Social DMs — Facebook and Instagram in one place
        </p>
      }
      list={
        <SocialDmThreadList
          key={refreshKey}
          platform="all"
          selectedId={selectedId}
          onSelect={(id, platform) => {
            setSelectedId(id);
            setSelectedPlatform(platform);
          }}
        />
      }
      detail={
        <SocialDmMessagePane
          platform={selectedPlatform}
          conversationId={selectedId}
          onSent={() => setRefreshKey((k) => k + 1)}
        />
      }
      listLabel="Conversations"
      selectedId={selectedId}
      onMobileBack={() => {
        setSelectedId(null);
        setSelectedPlatform(null);
      }}
    />
  );
}
