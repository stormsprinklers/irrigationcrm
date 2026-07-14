"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, Mail, MessageSquare, Phone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildInboxCustomerUrl } from "@/lib/inbox/links";
import { formatPhoneDisplay } from "@/lib/inbox/phone";
import { sanitizeEmailHtml } from "@/lib/inbox/attachments";
import { websiteLeadFormLabel } from "@/lib/leads/form-labels";
import { cn } from "@/lib/utils";

type LeadFilterTab = "to_contact" | "contacted" | "spam";

type WebsiteLeadInboxItem = {
  id: string;
  channel: "email" | "sms";
  name: string;
  source: string | null;
  subject: string | null;
  preview: string;
  createdAt: string;
  isRead: boolean;
  leadId: string | null;
  conversationId?: string;
  leadStatus: string | null;
  contactedAt: string | null;
  leadCreatedAt: string | null;
  leadPhone: string | null;
  leadEmail: string | null;
  convertedCustomerId: string | null;
};

type EmailDetail = {
  id: string;
  fromEmail: string;
  subject: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  threadId?: string | null;
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatElapsed(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function speedTone(ms: number, frozen: boolean) {
  if (frozen) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (ms < 5 * 60_000) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (ms < 15 * 60_000) return "text-amber-800 bg-amber-50 border-amber-200";
  return "text-red-700 bg-red-50 border-red-200";
}

function SpeedToLeadTimer({
  startedAt,
  contactedAt,
  status,
}: {
  startedAt: string;
  contactedAt: string | null;
  status: string | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  const isSpam = status === "SPAM";
  const frozen = Boolean(contactedAt) || isSpam;

  useEffect(() => {
    if (frozen) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [frozen]);

  if (isSpam) {
    return (
      <span className="inline-flex items-center rounded border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
        Spam
      </span>
    );
  }

  const end = contactedAt ? new Date(contactedAt).getTime() : now;
  const elapsed = Math.max(0, end - new Date(startedAt).getTime());

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[11px] tabular-nums",
        speedTone(elapsed, Boolean(contactedAt))
      )}
      title={contactedAt ? "Time to first contact" : "Elapsed since lead arrived"}
    >
      <span className="font-sans text-[10px] uppercase tracking-wide opacity-70">
        {contactedAt ? "Contacted in" : "Speed to lead"}
      </span>
      {formatElapsed(elapsed)}
    </span>
  );
}

function statusLabel(status: string | null) {
  if (!status) return null;
  if (status === "CONTACTED") return "Contacted";
  if (status === "SPAM") return "Spam";
  if (status === "NEW") return "New";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function leadMatchesTab(item: WebsiteLeadInboxItem, tab: LeadFilterTab) {
  const status = item.leadStatus;
  if (tab === "spam") return status === "SPAM";
  if (tab === "contacted") return status === "CONTACTED";
  return status !== "SPAM" && status !== "CONTACTED";
}

function tabForLeadStatus(status: string | null): LeadFilterTab {
  if (status === "SPAM") return "spam";
  if (status === "CONTACTED") return "contacted";
  return "to_contact";
}

export function WebsiteLeadsInbox() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<WebsiteLeadInboxItem[]>([]);
  const [filterTab, setFilterTab] = useState<LeadFilterTab>("to_contact");
  const [selected, setSelected] = useState<WebsiteLeadInboxItem | null>(null);
  const [emailDetail, setEmailDetail] = useState<EmailDetail | null>(null);
  const [smsBody, setSmsBody] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  /** Tracks which deep-link query we've already applied so list refreshes don't fight clicks. */
  const appliedDeepLinkRef = useRef<string | null>(null);

  const filteredItems = useMemo(
    () => items.filter((item) => leadMatchesTab(item, filterTab)),
    [items, filterTab]
  );

  const tabCounts = useMemo(() => {
    let toContact = 0;
    let contacted = 0;
    let spam = 0;
    for (const item of items) {
      if (item.leadStatus === "SPAM") spam += 1;
      else if (item.leadStatus === "CONTACTED") contacted += 1;
      else toContact += 1;
    }
    return { toContact, contacted, spam };
  }, [items]);

  const loadItems = useCallback(async () => {
    const res = await fetch("/api/inbox/leads");
    if (!res.ok) return;
    const data = await res.json();
    const nextItems: WebsiteLeadInboxItem[] = data.items ?? [];
    setItems(nextItems);
    setSelected((current) => {
      if (!current) return current;
      const match = nextItems.find(
        (item) => item.id === current.id && item.channel === current.channel
      );
      return match ?? current;
    });
  }, []);

  useEffect(() => {
    void loadItems();
    const interval = setInterval(loadItems, 15_000);
    return () => clearInterval(interval);
  }, [loadItems]);

  // Deep-link from notifications: apply once per emailId/conversationId, then stop
  // re-forcing selection so clicking other leads works.
  useEffect(() => {
    const emailId = searchParams.get("emailId");
    const conversationId = searchParams.get("conversationId");
    if (!items.length) return;

    const deepLinkKey = emailId
      ? `email:${emailId}`
      : conversationId
        ? `sms:${conversationId}`
        : null;

    if (!deepLinkKey) {
      appliedDeepLinkRef.current = null;
      return;
    }
    if (appliedDeepLinkRef.current === deepLinkKey) return;

    if (emailId) {
      const match = items.find((item) => item.channel === "email" && item.id === emailId);
      if (match) {
        setFilterTab(tabForLeadStatus(match.leadStatus));
        setSelected(match);
        appliedDeepLinkRef.current = deepLinkKey;
      }
      return;
    }

    const match = items.find(
      (item) => item.channel === "sms" && item.conversationId === conversationId
    );
    if (match) {
      setFilterTab(tabForLeadStatus(match.leadStatus));
      setSelected(match);
      appliedDeepLinkRef.current = deepLinkKey;
    }
  }, [searchParams, items]);

  useEffect(() => {
    if (!selected) return;
    if (!leadMatchesTab(selected, filterTab)) {
      setSelected(null);
    }
  }, [filterTab, selected]);

  useEffect(() => {
    if (!selected) {
      setEmailDetail(null);
      setSmsBody(null);
      return;
    }

    let cancelled = false;
    setLoadingDetail(true);
    if (selected.channel === "email") {
      fetch(`/api/inbox/email/${selected.id}`)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          setEmailDetail(data);
          setSmsBody(null);
          setItems((current) => {
            const target = current.find((item) => item.id === selected.id);
            if (!target || target.isRead) return current;
            return current.map((item) =>
              item.id === selected.id ? { ...item, isRead: true } : item
            );
          });
        })
        .catch(() => {
          if (!cancelled) toast.error("Failed to load form submission");
        })
        .finally(() => {
          if (!cancelled) setLoadingDetail(false);
        });
      return () => {
        cancelled = true;
      };
    }

    if (!selected.conversationId) {
      setLoadingDetail(false);
      return;
    }

    const conversationId = selected.conversationId;
    const selectedId = selected.id;
    const preview = selected.preview;
    fetch(`/api/inbox/sms/conversations/${conversationId}/messages`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const messages = data.messages ?? [];
        const message = messages.find((row: { id: string }) => row.id === selectedId);
        setSmsBody(message?.body ?? preview);
        setEmailDetail(null);
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load form submission");
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected]);

  function selectItem(item: WebsiteLeadInboxItem) {
    setSelected(item);
    // Drop notification deep-link params so they can't snap selection back.
    if (searchParams.get("emailId") || searchParams.get("conversationId")) {
      appliedDeepLinkRef.current = null;
      router.replace("/inbox/leads", { scroll: false });
    }
  }

  function patchLocalLeadStatus(
    leadId: string,
    status: string,
    contactedAt: string | null
  ) {
    const apply = (item: WebsiteLeadInboxItem): WebsiteLeadInboxItem =>
      item.leadId === leadId ? { ...item, leadStatus: status, contactedAt } : item;
    setItems((current) => current.map(apply));
    setSelected((current) => (current ? apply(current) : current));
  }

  async function updateLeadStatus(status: "CONTACTED" | "SPAM" | "NEW") {
    if (!selected?.leadId) {
      toast.error("No linked lead record for this submission");
      return;
    }
    setStatusBusy(true);
    try {
      const res = await fetch(`/api/leads/${selected.leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        toast.error("Failed to update lead");
        return;
      }
      const data = await res.json();
      patchLocalLeadStatus(
        selected.leadId,
        data.status ?? status,
        data.contactedAt ?? (status === "CONTACTED" ? new Date().toISOString() : selected.contactedAt)
      );
      setFilterTab(tabForLeadStatus(data.status ?? status));
      if (status === "CONTACTED") toast.success("Marked as contacted");
      else if (status === "SPAM") toast.success("Marked as spam");
      else toast.success("Lead reopened");
    } finally {
      setStatusBusy(false);
    }
  }

  async function markContactedThenNavigate(href: string) {
    if (selected?.leadId && selected.leadStatus !== "CONTACTED") {
      try {
        const res = await fetch(`/api/leads/${selected.leadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "CONTACTED" }),
        });
        if (res.ok) {
          const data = await res.json();
          patchLocalLeadStatus(
            selected.leadId,
            data.status ?? "CONTACTED",
            data.contactedAt ?? new Date().toISOString()
          );
          setFilterTab("contacted");
        }
      } catch {
        // Navigation still proceeds so the CSR can reach the lead.
      }
    }
    router.push(href);
  }

  async function removeSelected() {
    if (!selected || selected.channel !== "email") return;
    const res = await fetch(`/api/inbox/email/${selected.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to remove submission");
      return;
    }
    toast.success("Removed");
    setSelected(null);
    if (searchParams.get("emailId") || searchParams.get("conversationId")) {
      appliedDeepLinkRef.current = null;
      router.replace("/inbox/leads", { scroll: false });
    }
    await loadItems();
  }

  const timerStart = selected?.leadCreatedAt ?? selected?.createdAt ?? null;
  const linkParams = selected
    ? {
        customerId: selected.convertedCustomerId ?? undefined,
        phone: selected.leadPhone,
        email: selected.leadEmail,
        name: selected.name,
      }
    : null;

  return (
    <div className="flex h-full w-full min-w-0 overflow-hidden">
      <div className="flex h-full w-80 shrink-0 flex-col border-r border-border bg-white">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">Inbox &gt; Leads</p>
          <h2 className="mt-1 font-medium">Website forms</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Contact and other form submissions from stormsprinklers.com
          </p>
          <Tabs
            value={filterTab}
            onValueChange={(value) => setFilterTab(value as LeadFilterTab)}
            className="mt-3"
          >
            <TabsList className="grid h-auto w-full grid-cols-3 gap-0.5 p-1">
              <TabsTrigger value="to_contact" className="px-1.5 text-[11px]">
                To contact
                <span className="ml-1 opacity-70">{tabCounts.toContact}</span>
              </TabsTrigger>
              <TabsTrigger value="contacted" className="px-1.5 text-[11px]">
                Contacted
                <span className="ml-1 opacity-70">{tabCounts.contacted}</span>
              </TabsTrigger>
              <TabsTrigger value="spam" className="px-1.5 text-[11px]">
                Spam
                <span className="ml-1 opacity-70">{tabCounts.spam}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          {!items.length ? (
            <p className="p-4 text-sm text-muted-foreground">No form submissions yet.</p>
          ) : !filteredItems.length ? (
            <p className="p-4 text-sm text-muted-foreground">
              {filterTab === "to_contact"
                ? "No leads waiting to be contacted."
                : filterTab === "contacted"
                  ? "No contacted leads yet."
                  : "No spam leads."}
            </p>
          ) : (
            <ul>
              {filteredItems.map((item) => {
                const start = item.leadCreatedAt ?? item.createdAt;
                return (
                  <li key={`${item.channel}-${item.id}`}>
                    <button
                      type="button"
                      onClick={() => selectItem(item)}
                      className={cn(
                        "flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left hover:bg-muted/50",
                        selected?.id === item.id &&
                          selected?.channel === item.channel &&
                          "bg-highlight",
                        !item.isRead && item.channel === "email" && "font-semibold",
                        item.leadStatus === "SPAM" && "opacity-60"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm">{item.name}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {formatWhen(item.createdAt)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.source ? (
                          <span className="text-xs text-primary">
                            {websiteLeadFormLabel(item.source)}
                          </span>
                        ) : null}
                        {item.leadStatus && item.leadStatus !== "NEW" ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {statusLabel(item.leadStatus)}
                          </span>
                        ) : null}
                      </div>
                      <SpeedToLeadTimer
                        startedAt={start}
                        contactedAt={item.contactedAt}
                        status={item.leadStatus}
                      />
                      <span className="truncate text-xs text-muted-foreground">{item.preview}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </div>

      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-white">
        {!selected ? (
          <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
            Select a form submission to view details.
          </div>
        ) : loadingDetail ? (
          <div className="p-6 text-sm text-muted-foreground">Loading...</div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 border-b border-border p-4">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold">{selected.name}</h3>
                  {selected.leadStatus ? (
                    <span className="rounded bg-muted px-2 py-0.5 text-xs uppercase tracking-wide text-muted-foreground">
                      {statusLabel(selected.leadStatus)}
                    </span>
                  ) : null}
                </div>
                {selected.source ? (
                  <p className="text-sm text-muted-foreground">
                    Source: {websiteLeadFormLabel(selected.source)}
                  </p>
                ) : null}
                {emailDetail ? (
                  <p className="text-sm text-muted-foreground">From: {emailDetail.fromEmail}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">{formatWhen(selected.createdAt)}</p>
                {timerStart ? (
                  <SpeedToLeadTimer
                    startedAt={timerStart}
                    contactedAt={selected.contactedAt}
                    status={selected.leadStatus}
                  />
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/customers/leads">
                    <ExternalLink className="mr-1 h-4 w-4" />
                    All leads
                  </Link>
                </Button>
                {selected.channel === "email" ? (
                  <Button variant="ghost" size="icon" onClick={removeSelected}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="space-y-3 border-b border-border px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                {selected.leadPhone ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-primary hover:underline"
                    onClick={() =>
                      void markContactedThenNavigate(
                        buildInboxCustomerUrl("voice", linkParams!)
                      )
                    }
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {formatPhoneDisplay(selected.leadPhone)}
                  </button>
                ) : (
                  <span className="text-muted-foreground">No phone</span>
                )}
                {selected.leadEmail ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-primary hover:underline"
                    onClick={() =>
                      void markContactedThenNavigate(
                        buildInboxCustomerUrl("email", linkParams!)
                      )
                    }
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {selected.leadEmail}
                  </button>
                ) : (
                  <span className="text-muted-foreground">No email</span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {selected.leadPhone ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void markContactedThenNavigate(
                          buildInboxCustomerUrl("voice", linkParams!)
                        )
                      }
                    >
                      <Phone className="mr-1.5 h-3.5 w-3.5" />
                      Call
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void markContactedThenNavigate(
                          buildInboxCustomerUrl("sms", linkParams!)
                        )
                      }
                    >
                      <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                      SMS
                    </Button>
                  </>
                ) : null}
                {selected.leadEmail ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void markContactedThenNavigate(
                        buildInboxCustomerUrl("email", linkParams!)
                      )
                    }
                  >
                    <Mail className="mr-1.5 h-3.5 w-3.5" />
                    Email
                  </Button>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={statusBusy || !selected.leadId || selected.leadStatus === "CONTACTED"}
                  onClick={() => void updateLeadStatus("CONTACTED")}
                >
                  Mark contacted
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={statusBusy || !selected.leadId || selected.leadStatus === "SPAM"}
                  onClick={() => void updateLeadStatus("SPAM")}
                >
                  Mark spam
                </Button>
                {selected.leadStatus === "SPAM" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={statusBusy || !selected.leadId}
                    onClick={() => void updateLeadStatus("NEW")}
                  >
                    Undo spam
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {emailDetail?.bodyHtml ? (
                <div
                  className="prose prose-sm max-w-none whitespace-pre-wrap text-sm"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeEmailHtml(emailDetail.bodyHtml),
                  }}
                />
              ) : (
                <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">
                  {emailDetail?.bodyText ?? smsBody ?? selected.preview}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
