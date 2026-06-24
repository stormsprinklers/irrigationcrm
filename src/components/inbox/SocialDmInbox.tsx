"use client";

import { Facebook, Instagram, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SocialScope } from "@/lib/inbox/types";

const PLATFORM_CONFIG: Record<
  SocialScope,
  { label: string; icon: typeof Facebook; color: string }
> = {
  facebook: { label: "Facebook", icon: Facebook, color: "text-[#1877F2]" },
  instagram: { label: "Instagram", icon: Instagram, color: "text-[#E4405F]" },
};

export function SocialDmThreadList({ platform }: { platform: SocialScope }) {
  const config = PLATFORM_CONFIG[platform];
  const Icon = config.icon;

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Icon className={`h-6 w-6 ${config.color}`} />
        </div>
        <p className="text-sm font-medium">{config.label} direct messages</p>
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">
          Connect your {config.label} account to receive and reply to DMs in the inbox.
        </p>
        <Badge variant="secondary" className="mt-4 text-[10px]">
          Integration coming soon
        </Badge>
      </div>
    </ScrollArea>
  );
}

export function SocialDmMessagePane({
  platform,
  conversationId,
}: {
  platform: SocialScope;
  conversationId: string | null;
}) {
  const config = PLATFORM_CONFIG[platform];
  const Icon = config.icon;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${config.color}`} />
          <h3 className="font-semibold">
            {conversationId ? "Conversation" : `${config.label} DMs`}
          </h3>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Unified inbox for {config.label} direct messages
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center bg-muted/20 px-6 text-center">
        <MessageCircle className="mb-3 h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          {conversationId
            ? "Message thread will load here once the integration is connected."
            : "Select a conversation or wait for new DMs after connecting your account."}
        </p>
      </div>

      <div className="shrink-0 border-t border-border bg-white p-4">
        <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2.5 text-center text-xs text-muted-foreground">
          Reply composer — available after {config.label} integration
        </div>
      </div>
    </div>
  );
}
