"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { InboxChannelLayout } from "@/components/inbox/InboxChannelLayout";
import { SmsThreadList } from "@/components/inbox/SmsThreadList";
import { SmsMessagePane } from "@/components/inbox/SmsMessagePane";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import type { CustomerTeamScope } from "@/lib/inbox/types";
import { isCustomerTeamScope, parseInboxRoute } from "@/lib/inbox/types";

const DEEP_LINK_KEYS = ["customerId", "phone", "email", "name", "conversationId"] as const;

export function InboxChannelView({
  channel,
  scope,
}: {
  channel: string;
  scope: string;
}) {
  const parsed = parseInboxRoute(channel, scope);
  const router = useRouter();
  const pathname = usePathname();
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
  const [isComposing, setIsComposing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [smsFolder, setSmsFolder] = useState<"inbox" | "spam">("inbox");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const userOverrideRef = useRef(false);

  const ch = parsed?.channel;
  const sc = parsed?.scope;

  function clearInboxDeepLink() {
    if (!DEEP_LINK_KEYS.some((key) => searchParams.get(key))) return;
    router.replace(pathname || `/inbox/${channel}/${scope}`, { scroll: false });
  }

  useEffect(() => {
    if (deepLink.customerId || deepLink.phone) {
      userOverrideRef.current = false;
    }
  }, [deepLink.customerId, deepLink.phone]);

  useEffect(() => {
    if (ch !== "sms" || sc !== "customers") return;
    const conversationId = searchParams.get("conversationId");
    if (conversationId) {
      setSelectedId(conversationId);
      setIsComposing(false);
    }
  }, [ch, sc, searchParams]);

  useEffect(() => {
    if (!ch || !sc) return;
    if (ch !== "sms" || sc !== "customers") return;
    if (!deepLink.customerId && !deepLink.phone) return;

    const params = new URLSearchParams();
    if (deepLink.customerId) params.set("customerId", deepLink.customerId);
    if (deepLink.phone) params.set("phone", deepLink.phone);

    let cancelled = false;
    fetch(`/api/inbox/sms/conversations/resolve?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || userOverrideRef.current) return;
        if (data.conversation?.id) {
          setSelectedId(data.conversation.id);
          setIsComposing(false);
        } else if (deepLink.phone || deepLink.customerId) {
          setIsComposing(true);
          setSelectedId(null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ch, sc, deepLink.customerId, deepLink.phone]);

  if (!parsed || !ch || !sc) {
    return <div className="p-6">Invalid inbox route</div>;
  }

  if (!isCustomerTeamScope(sc) || ch !== "sms") {
    return <div className="p-6">Invalid inbox route</div>;
  }

  const teamScope: CustomerTeamScope = sc;
  const showCompose = isComposing || Boolean(selectedId);

  return (
    <div className="h-full w-full min-w-0">
      <InboxChannelLayout
        channel={ch}
        scope={sc}
        selectedId={selectedId}
        listFirst
        composing={isComposing && !selectedId}
        onCompose={() => {
          userOverrideRef.current = true;
          setSmsFolder("inbox");
          setSelectedId(null);
          setIsComposing(true);
          clearInboxDeepLink();
        }}
        onMobileBack={() => {
          userOverrideRef.current = true;
          setSelectedId(null);
          setIsComposing(false);
          clearInboxDeepLink();
        }}
        list={
          <div className="flex h-full flex-col">
            {teamScope === "customers" && (
              <Tabs value={smsFolder} onValueChange={(value) => {
                setSmsFolder(value as "inbox" | "spam");
                setSelectedId(null);
                setIsComposing(false);
                clearInboxDeepLink();
              }} className="shrink-0 border-b px-3 py-2">
                <TabsList className="w-full">
                  <TabsTrigger value="inbox" className="flex-1">Inbox</TabsTrigger>
                  <TabsTrigger value="spam" className="flex-1">Spam</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            <div className="shrink-0 border-b px-3 py-2">
              <Button type="button" variant={unreadOnly ? "secondary" : "outline"} size="sm" onClick={() => {
                setUnreadOnly((value) => !value);
                setSelectedId(null);
                setIsComposing(false);
              }} aria-pressed={unreadOnly}>Unread only</Button>
            </div>
            <SmsThreadList
              key={`${refreshKey}-${smsFolder}`}
              scope={teamScope}
              spam={teamScope === "customers" && smsFolder === "spam"}
              unreadOnly={unreadOnly}
              selectedId={selectedId}
              onSelect={(id) => {
                userOverrideRef.current = true;
                setSelectedId(id);
                setIsComposing(false);
                clearInboxDeepLink();
              }}
            />
          </div>
        }
        detail={
          showCompose || selectedId ? (
            <SmsMessagePane
              conversationId={selectedId}
              scope={teamScope}
              initialPhone={selectedId ? null : deepLink.phone}
              initialCustomerId={selectedId ? null : deepLink.customerId}
              initialName={selectedId ? null : deepLink.name}
              spam={teamScope === "customers" && smsFolder === "spam"}
              onMovedToSpam={() => {
                setSmsFolder("spam");
                setRefreshKey((key) => key + 1);
                clearInboxDeepLink();
              }}
              onRestoredFromSpam={() => {
                setSmsFolder("inbox");
                setRefreshKey((key) => key + 1);
                clearInboxDeepLink();
              }}
              onSent={(id) => {
                userOverrideRef.current = true;
                setSelectedId(id);
                setIsComposing(false);
                setRefreshKey((k) => k + 1);
                clearInboxDeepLink();
              }}
            />
          ) : (
            <div className="hidden h-full items-center justify-center p-6 text-sm text-muted-foreground md:flex">
              Select a conversation or compose a new message
            </div>
          )
        }
      />
    </div>
  );
}
