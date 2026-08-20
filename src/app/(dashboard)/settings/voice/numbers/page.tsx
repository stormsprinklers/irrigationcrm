"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { PortNumberWizard } from "@/components/settings/voice/PortNumberWizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPhoneDisplay } from "@/lib/inbox/phone";
import { vanityLettersToDigits } from "@/lib/twilio/vanity";

type PhoneNumberRow = {
  id: string;
  companyId: string;
  e164: string;
  friendlyName: string | null;
  numberType: string;
  isPrimary: boolean;
  smsEnabled: boolean | null;
  voiceEnabled: boolean | null;
  trackingSource: string | null;
  callFlowId: string | null;
  assignedUserId: string | null;
  twilioSid: string | null;
  callFlow?: { id: string; name: string } | null;
  assignedUser?: { id: string; name: string } | null;
  company?: { id: string; name: string } | null;
};

type CompanyOption = { id: string; name: string };

type CallFlowOption = { id: string; name: string };
type EmployeeOption = { id: string; name: string };
type AvailableNumber = {
  e164: string;
  locality?: string | null;
  region?: string | null;
  areaCode?: string | null;
};

type A2pNumberStatus = {
  id: string;
  e164: string;
  companyId: string;
  companyName: string;
  isPrimary: boolean;
  twilioSid: string | null;
  onMessagingService: boolean;
};

type A2pStatus = {
  configured: boolean;
  messagingServiceSid: string | null;
  messagingServiceName?: string | null;
  sidSource?: "app" | "env" | null;
  availableServices?: Array<{
    sid: string;
    friendlyName: string | null;
    inboundRequestUrl: string | null;
  }>;
  servicesError?: string | null;
  messagingServiceNumberCount?: number;
  listError?: string | null;
  companies: Array<{
    id: string;
    name: string;
    phoneNumberCount: number;
    twilioPhone: string | null;
  }>;
  numbers: A2pNumberStatus[];
  twilioLinkedCount: number;
  missingOnServiceCount: number;
  missingPrimaryCount: number;
};

const NUMBER_TYPES = [
  { value: "PRIMARY", label: "Primary" },
  { value: "TRACKING", label: "Tracking" },
  { value: "AGENT_DIRECT", label: "Agent direct line" },
];

const DEFAULT_AREA_CODES = ["801"];

export default function VoiceNumbersPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const canManageA2p =
    session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER";
  const [tab, setTab] = useState<"list" | "buy" | "port" | "a2p" | "release">("list");
  const [numbers, setNumbers] = useState<PhoneNumberRow[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [flows, setFlows] = useState<CallFlowOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [e164, setE164] = useState("");
  const [friendlyName, setFriendlyName] = useState("");
  const [callFlowId, setCallFlowId] = useState("");
  const [numberType, setNumberType] = useState("TRACKING");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [trackingSource, setTrackingSource] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [areaCodes, setAreaCodes] = useState<string[]>(DEFAULT_AREA_CODES);
  const [areaCodeDraft, setAreaCodeDraft] = useState("");
  const [containsPattern, setContainsPattern] = useState("");
  const [searchResults, setSearchResults] = useState<AvailableNumber[]>([]);
  const [searching, setSearching] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [a2pStatus, setA2pStatus] = useState<A2pStatus | null>(null);
  const [a2pSyncing, setA2pSyncing] = useState(false);
  const [a2pServiceDraft, setA2pServiceDraft] = useState("");
  const [a2pSavingService, setA2pSavingService] = useState(false);
  const [releaseToken, setReleaseToken] = useState<string | null>(null);
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaPhone, setMfaPhone] = useState("");
  const [releasingId, setReleasingId] = useState<string | null>(null);

  const digitPreview = useMemo(
    () => vanityLettersToDigits(containsPattern),
    [containsPattern]
  );
  const hasLetters = /[A-Za-z]/.test(containsPattern);
  const twilioNumbers = useMemo(
    () => numbers.filter((n) => Boolean(n.twilioSid)),
    [numbers]
  );

  function load() {
    Promise.all([
      fetch("/api/settings/voice/numbers").then((r) => r.json()),
      fetch("/api/settings/voice/flows").then((r) => r.json()),
      fetch("/api/settings/employees?status=ACTIVE").then((r) => r.json()),
    ])
      .then(([nums, fl, emps]) => {
        if (nums?.error) {
          toast.error(nums.error);
          setNumbers([]);
          setCompanies([]);
        } else if (Array.isArray(nums)) {
          setNumbers(nums);
          setCompanies([]);
        } else {
          setNumbers(Array.isArray(nums?.numbers) ? nums.numbers : []);
          setCompanies(Array.isArray(nums?.companies) ? nums.companies : []);
        }
        setFlows(Array.isArray(fl) ? fl.map((f: CallFlowOption) => ({ id: f.id, name: f.name })) : []);
        setEmployees(Array.isArray(emps) ? emps.map((e: EmployeeOption) => ({ id: e.id, name: e.name })) : []);
      })
      .catch(() => toast.error("Failed to load numbers"));
  }

  useEffect(() => {
    load();
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t === "port" || t === "buy" || t === "a2p" || t === "release") setTab(t);
  }, []);

  useEffect(() => {
    if (tab !== "a2p") return;
    fetch("/api/settings/voice/numbers/a2p")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          toast.error(data.error);
          return;
        }
        setA2pStatus(data);
        setA2pServiceDraft(data.messagingServiceSid ?? "");
      })
      .catch(() => toast.error("Failed to load A2P status"));
  }, [tab]);

  async function saveA2pMessagingService() {
    setA2pSavingService(true);
    try {
      const res = await fetch("/api/settings/voice/numbers/a2p", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messagingServiceSid: a2pServiceDraft.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save Messaging Service");
        return;
      }
      setA2pStatus(data);
      setA2pServiceDraft(data.messagingServiceSid ?? "");
      toast.success(
        data.messagingServiceSid
          ? "Messaging Service saved — attach numbers next"
          : "Messaging Service cleared"
      );
    } finally {
      setA2pSavingService(false);
    }
  }

  async function syncA2p() {
    setA2pSyncing(true);
    try {
      const res = await fetch("/api/settings/voice/numbers/a2p", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "A2P sync failed");
        return;
      }
      const failCount = Array.isArray(data.failed) ? data.failed.length : 0;
      toast.success(
        `A2P sync: ${data.attached} attached, ${data.alreadyAttached} already on campaign` +
          (failCount ? `, ${failCount} failed` : "")
      );
      if (failCount) {
        for (const row of data.failed.slice(0, 4)) {
          toast.error(
            `${formatPhoneDisplay(row.e164)}: ${row.error}`,
            { duration: 8000 }
          );
        }
      }
      const statusRes = await fetch("/api/settings/voice/numbers/a2p");
      if (statusRes.ok) {
        const status = await statusRes.json();
        setA2pStatus(status);
        setA2pServiceDraft(status.messagingServiceSid ?? "");
      }
    } finally {
      setA2pSyncing(false);
    }
  }

  async function startReleaseMfa() {
    const res = await fetch("/api/settings/voice/numbers/release-mfa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Failed to start MFA");
      return;
    }
    setMfaChallengeId(data.challengeId);
    setMfaPhone(data.phoneMasked ?? "");
    setMfaCode(data.debugCode ?? "");
    toast.success(`Verification code sent to ${data.phoneMasked}`);
  }

  async function verifyReleaseMfa() {
    if (!mfaChallengeId || !mfaCode.trim()) {
      toast.error("Enter the verification code");
      return;
    }
    const res = await fetch("/api/settings/voice/numbers/release-mfa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "verify",
        challengeId: mfaChallengeId,
        code: mfaCode.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Invalid code");
      return;
    }
    setReleaseToken(data.actionToken);
    setMfaChallengeId(null);
    setMfaCode("");
    toast.success("Verified — you can release numbers for 10 minutes");
  }

  function addAreaCode() {
    const code = areaCodeDraft.replace(/\D/g, "").slice(0, 3);
    if (code.length !== 3) {
      toast.error("Area codes must be 3 digits");
      return;
    }
    if (areaCodes.includes(code)) {
      setAreaCodeDraft("");
      return;
    }
    setAreaCodes((prev) => [...prev, code]);
    setAreaCodeDraft("");
  }

  function removeAreaCode(code: string) {
    setAreaCodes((prev) => prev.filter((c) => c !== code));
  }

  async function addNumber(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/settings/voice/numbers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        e164,
        friendlyName,
        callFlowId: callFlowId || null,
        isPrimary,
        numberType,
        assignedUserId: assignedUserId || null,
        trackingSource: trackingSource || null,
      }),
    });
    if (!res.ok) {
      toast.error("Failed to add number");
      return;
    }
    setE164("");
    setFriendlyName("");
    load();
    toast.success("Number added");
  }

  async function syncFromTwilio() {
    setSyncing(true);
    try {
      const res = await fetch("/api/settings/voice/numbers/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Sync failed");
        return;
      }
      toast.success(`Imported ${data.imported}, updated ${data.updated}`);
      load();
    } finally {
      setSyncing(false);
    }
  }

  async function searchNumbers() {
    const pendingCode = areaCodeDraft.replace(/\D/g, "").slice(0, 3);
    const codes =
      pendingCode.length === 3 && !areaCodes.includes(pendingCode)
        ? [...areaCodes, pendingCode]
        : areaCodes;
    if (pendingCode.length === 3 && !areaCodes.includes(pendingCode)) {
      setAreaCodes(codes);
      setAreaCodeDraft("");
    }

    if (!codes.length && !containsPattern.trim()) {
      toast.error("Add an area code and/or a digit or vanity pattern");
      return;
    }

    setSearching(true);
    try {
      const params = new URLSearchParams();
      if (codes.length) params.set("areaCodes", codes.join(","));
      if (containsPattern.trim()) params.set("contains", containsPattern.trim());
      const res = await fetch(`/api/settings/voice/numbers/search?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Search failed");
        setSearchResults([]);
      return;
    }
    setSearchResults(data.numbers ?? []);
      if (!(data.numbers ?? []).length) {
        toast.message("No matching numbers found — try another pattern or area code");
      }
    } finally {
      setSearching(false);
    }
  }

  async function purchaseNumber(phone: string) {
    setPurchasing(phone);
    try {
    const res = await fetch("/api/settings/voice/numbers/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        e164: phone,
        friendlyName,
        numberType,
          isPrimary: numberType === "PRIMARY",
        callFlowId: callFlowId || null,
          assignedUserId: assignedUserId || null,
        trackingSource: trackingSource || null,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error ?? "Purchase failed");
      return;
    }
    toast.success("Number purchased");
    setTab("list");
    load();
    } finally {
      setPurchasing(null);
    }
  }

  const sessionCompanyId = session?.user?.companyId ?? "";
  const showCompanyColumn = companies.length > 1;
  const sortedNumbers = numbers;

  async function updateNumber(id: string, patch: Partial<PhoneNumberRow> & { companyId?: string }) {
    const res = await fetch(`/api/settings/voice/numbers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(typeof data.error === "string" ? data.error : "Update failed");
      return;
    }
    if (patch.companyId && patch.companyId !== sessionCompanyId) {
      toast.success("Moved to the other company — switch accounts to manage it there");
    } else if (patch.companyId) {
      toast.success("Company updated");
    }
    load();
  }

  async function releaseNumberWithMfa(id: string) {
    if (!releaseToken) {
      toast.error("Complete admin MFA before releasing a number");
      await startReleaseMfa();
      return;
    }
    if (
      !window.confirm(
        "Permanently release this number from Twilio? This cannot be undone."
      )
    ) {
      return;
    }
    setReleasingId(id);
    try {
      const res = await fetch(
        `/api/settings/voice/numbers/${id}?releaseTwilio=true`,
        {
          method: "DELETE",
          headers: { "x-phone-release-mfa": releaseToken },
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          setReleaseToken(null);
          toast.error(data.error ?? "MFA expired — verify again");
          await startReleaseMfa();
        } else {
          toast.error(data.error ?? "Release failed");
        }
        return;
      }
      toast.success("Number released from Twilio");
    load();
    } finally {
      setReleasingId(null);
    }
  }

  return (
    <ContentArea className={showCompanyColumn ? "max-w-6xl" : "max-w-4xl"}>
      <PageHeader
        breadcrumb={["Settings", "Voice", "Numbers"]}
        title="Phone numbers"
        subtitle="Manage tracking numbers, assign call flows, and purchase from Twilio"
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant={tab === "list" ? "default" : "outline"} onClick={() => setTab("list")}>
          Your numbers
        </Button>
        <Button variant={tab === "buy" ? "default" : "outline"} onClick={() => setTab("buy")}>
          Buy a number
        </Button>
        <Button variant={tab === "port" ? "default" : "outline"} onClick={() => setTab("port")}>
          Port a number
        </Button>
        <Button variant={tab === "a2p" ? "default" : "outline"} onClick={() => setTab("a2p")}>
          A2P campaign
        </Button>
        {isAdmin ? (
          <Button
            variant={tab === "release" ? "default" : "outline"}
            onClick={() => setTab("release")}
          >
            Release numbers
          </Button>
        ) : null}
        <Button variant="outline" onClick={syncFromTwilio} disabled={syncing}>
          {syncing ? "Syncing..." : "Import from Twilio"}
        </Button>
      </div>

      {tab === "port" ? (
        <PortNumberWizard onImported={load} />
      ) : tab === "a2p" ? (
        <div className="space-y-4 rounded-lg border border-border bg-white p-6">
          <div>
            <h3 className="font-semibold">Shared A2P / 10DLC campaign</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose the Twilio Messaging Service that holds your approved A2P campaign. One service
              covers every phone number across businesses you operate (for example Storm Sprinklers
              and Chestnut &amp; Cheer). New purchases, ports, and transfers attach to this service
              automatically.
            </p>
          </div>
          {!a2pStatus ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="space-y-3 rounded-md border border-border bg-muted/30 px-3 py-3 text-sm">
                <div>
                  <label className="mb-1 block text-xs font-medium">Messaging Service</label>
                  {a2pStatus.servicesError ? (
                    <p className="text-amber-800">
                      Could not list Twilio Messaging Services: {a2pStatus.servicesError}
                    </p>
                  ) : (
                    <select
                      className="flex h-10 w-full max-w-xl rounded-md border border-input bg-background px-3 text-sm"
                      value={a2pServiceDraft}
                      onChange={(e) => setA2pServiceDraft(e.target.value)}
                      disabled={!canManageA2p || a2pSavingService}
                    >
                      <option value="">Select a Messaging Service…</option>
                      {(a2pStatus.availableServices ?? []).map((s) => (
                        <option key={s.sid} value={s.sid}>
                          {(s.friendlyName || "Untitled service") + ` (${s.sid})`}
                        </option>
                      ))}
                    </select>
                  )}
                  {a2pStatus.sidSource === "env" ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Currently using a legacy env value. Save a selection here to manage it in the
                      app instead.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Pick the service tied to your approved US A2P 10DLC campaign in Twilio, then
                      save.
                    </p>
                  )}
                </div>
                {canManageA2p ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void saveA2pMessagingService()}
                    disabled={
                      a2pSavingService ||
                      a2pServiceDraft === (a2pStatus.messagingServiceSid ?? "")
                    }
                  >
                    {a2pSavingService ? "Saving…" : "Save Messaging Service"}
                  </Button>
                ) : null}
                <p>
                  Status:{" "}
                  {a2pStatus.configured ? (
                    <span className="font-medium text-green-700">Configured</span>
                  ) : (
                    <span className="font-medium text-amber-700">Not configured</span>
                  )}
                  {a2pStatus.messagingServiceName
                    ? ` · ${a2pStatus.messagingServiceName}`
                    : null}
                </p>
                {a2pStatus.messagingServiceSid ? (
                  <p className="font-mono text-xs text-muted-foreground">
                    {a2pStatus.messagingServiceSid}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No Messaging Service selected yet — choose one above.
                  </p>
                )}
                <p className="text-muted-foreground">
                  {a2pStatus.twilioLinkedCount} Twilio-linked number
                  {a2pStatus.twilioLinkedCount === 1 ? "" : "s"} across your businesses
                  {typeof a2pStatus.messagingServiceNumberCount === "number" ? (
                    <>
                      {" · "}
                      {a2pStatus.messagingServiceNumberCount} currently in Sender Pool
                    </>
                  ) : null}
                  {a2pStatus.missingOnServiceCount > 0 ? (
                    <>
                      {" · "}
                      <span className="font-medium text-amber-800">
                        {a2pStatus.missingOnServiceCount} not on campaign
                        {a2pStatus.missingPrimaryCount > 0
                          ? ` (${a2pStatus.missingPrimaryCount} Primary)`
                          : ""}
                      </span>
                    </>
                  ) : a2pStatus.configured && a2pStatus.twilioLinkedCount > 0 ? (
                    <>
                      {" · "}
                      <span className="font-medium text-green-700">All on campaign</span>
                    </>
                  ) : null}
                </p>
              </div>
              {a2pStatus.listError ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-950">
                  Could not read the Messaging Service Sender Pool: {a2pStatus.listError}. Confirm
                  the selected service is correct in Twilio.
                </div>
              ) : null}
              {a2pStatus.missingPrimaryCount > 0 ? (
                <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
                  <p>
                    A Primary number is missing from the shared Messaging Service. That causes US
                    A2P 10DLC send failures for that company.
                  </p>
                  {canManageA2p ? (
                    <Button
                      type="button"
                      onClick={() => void syncA2p()}
                      disabled={!a2pStatus.configured || a2pSyncing || Boolean(a2pStatus.listError)}
                    >
                      {a2pSyncing
                        ? "Attaching…"
                        : "Attach all my businesses’ numbers to A2P"}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <ul className="space-y-1 text-sm">
                {a2pStatus.companies.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2 border-b border-border/60 py-2">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground">
                      {c.phoneNumberCount} number{c.phoneNumberCount === 1 ? "" : "s"}
                      {c.twilioPhone ? ` · Primary ${formatPhoneDisplay(c.twilioPhone)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              {Array.isArray(a2pStatus.numbers) && a2pStatus.numbers.length > 0 ? (
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Business</TableHead>
                        <TableHead>Number</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>On campaign</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {a2pStatus.numbers.map((n) => (
                        <TableRow key={n.id}>
                          <TableCell className="font-medium">{n.companyName}</TableCell>
                          <TableCell>{formatPhoneDisplay(n.e164)}</TableCell>
                          <TableCell>
                            {n.isPrimary ? (
                              <Badge variant="secondary">Primary</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {!n.twilioSid ? (
                              <span className="text-amber-800">No Twilio SID</span>
                            ) : n.onMessagingService ? (
                              <span className="text-green-700">Yes</span>
                            ) : (
                              <span className="font-medium text-amber-800">No</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
              {canManageA2p ? (
                <Button
                  type="button"
                  onClick={() => void syncA2p()}
                  disabled={!a2pStatus.configured || a2pSyncing || Boolean(a2pStatus.listError)}
                >
                  {a2pSyncing
                    ? "Syncing…"
                    : a2pStatus.missingOnServiceCount > 0
                      ? "Attach all my businesses’ numbers to A2P"
                      : "Re-sync A2P attachments"}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Only admins and managers can run A2P sync.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                A number can only sit in one Messaging Service Sender Pool. If attach fails because
                it&apos;s on another service, sync will try to move it to this shared campaign
                automatically.
              </p>
            </>
          )}
        </div>
      ) : tab === "release" && isAdmin ? (
        <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50/40 p-6">
          <div>
            <h3 className="font-semibold text-amber-950">Release numbers (admin only)</h3>
            <p className="mt-1 text-sm text-amber-900/80">
              Releasing removes the number from Twilio permanently. Verify with SMS 2FA first.
              This tab is separate from day-to-day number management on purpose.
            </p>
          </div>

          {!releaseToken ? (
            <div className="space-y-3 rounded-md border border-border bg-white p-4">
              <p className="text-sm font-medium">Admin verification (MFA)</p>
              {!mfaChallengeId ? (
                <Button type="button" onClick={() => void startReleaseMfa()}>
                  Send verification code
                </Button>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium">
                      Code sent to {mfaPhone}
                    </label>
            <Input
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value)}
                      className="w-40"
                      inputMode="numeric"
                    />
                  </div>
                  <Button type="button" onClick={() => void verifyReleaseMfa()}>
                    Verify
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void startReleaseMfa()}>
                    Resend
            </Button>
          </div>
              )}
            </div>
          ) : (
            <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              MFA verified — release available for about 10 minutes.
            </p>
          )}

          <ul className="divide-y divide-border rounded-md border border-border bg-white">
            {twilioNumbers.map((n) => (
              <li
                key={n.id}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">{n.friendlyName ?? formatPhoneDisplay(n.e164)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatPhoneDisplay(n.e164)} · {n.numberType}
                    {n.trackingSource ? ` · ${n.trackingSource}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={!releaseToken || releasingId === n.id}
                  onClick={() => void releaseNumberWithMfa(n.id)}
                >
                  {releasingId === n.id ? "Releasing…" : "Release from Twilio"}
                </Button>
              </li>
            ))}
            {!twilioNumbers.length ? (
              <li className="px-3 py-4 text-muted-foreground">
                No Twilio-linked numbers to release.
              </li>
            ) : null}
          </ul>
        </div>
      ) : tab === "buy" ? (
        <div className="space-y-5 rounded-lg border border-border bg-white p-6">
          <div>
            <h3 className="font-semibold">Search available numbers</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick one or more area codes, then optionally match a digit sequence or vanity letters
              (e.g. <span className="font-medium text-foreground">STORM</span> → 78676). Use{" "}
              <span className="font-mono text-foreground">*</span> as a single-digit wildcard.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Area codes</label>
            <div className="flex flex-wrap items-center gap-2">
              {areaCodes.map((code) => (
                <Badge key={code} variant="secondary" className="gap-1 px-2 py-1 text-sm">
                  {code}
                  <button
                    type="button"
                    className="ml-1 text-muted-foreground hover:text-foreground"
                    aria-label={`Remove area code ${code}`}
                    onClick={() => removeAreaCode(code)}
                  >
                    ×
                  </button>
                </Badge>
              ))}
              <Input
                placeholder="Add e.g. 385"
                value={areaCodeDraft}
                onChange={(e) => setAreaCodeDraft(e.target.value.replace(/\D/g, "").slice(0, 3))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addAreaCode();
                  }
                }}
                className="max-w-[120px]"
                inputMode="numeric"
              />
              <Button type="button" variant="outline" onClick={addAreaCode}>
                Add
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Contains digits or vanity letters</label>
            <Input
              placeholder="e.g. 8500, STORM, or *786*"
              value={containsPattern}
              onChange={(e) => setContainsPattern(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void searchNumbers();
                }
              }}
            />
            {containsPattern.trim() ? (
              <p className="text-xs text-muted-foreground">
                Twilio match pattern:{" "}
                <span className="font-mono text-foreground">{containsPattern.trim().toUpperCase()}</span>
                {hasLetters && digitPreview ? (
                  <>
                    {" "}
                    · keypad digits:{" "}
                    <span className="font-mono text-foreground">{digitPreview}</span>
                  </>
                ) : null}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Leave blank to browse any available numbers in the selected area codes.
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Number type (on purchase)</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={numberType}
              onChange={(e) => setNumberType(e.target.value)}
            >
              {NUMBER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Call flow</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={callFlowId}
                onChange={(e) => setCallFlowId(e.target.value)}
              >
                <option value="">Default flow (ring agents)</option>
                {flows.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            {numberType === "TRACKING" ? (
              <div className="space-y-1 sm:col-span-2">
                <label className="text-sm font-medium">Tracking source</label>
                <Input
                  placeholder="e.g. Google Ads PPC Repair"
                  value={trackingSource}
                  onChange={(e) => setTrackingSource(e.target.value)}
                />
              </div>
            ) : null}
            {numberType === "AGENT_DIRECT" ? (
              <div className="space-y-1 sm:col-span-2">
                <label className="text-sm font-medium">Assign to employee</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={assignedUserId}
                onChange={(e) => setAssignedUserId(e.target.value)}
              >
                <option value="">Select employee</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              </div>
            ) : null}
            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm font-medium">Title (optional)</label>
              <Input
                placeholder="e.g. PPC Repair tracking"
                value={friendlyName}
                onChange={(e) => setFriendlyName(e.target.value)}
              />
            </div>
          </div>

          <Button type="button" onClick={() => void searchNumbers()} disabled={searching}>
            {searching ? "Searching…" : "Search numbers"}
          </Button>

          <ul className="divide-y divide-border rounded-md border border-border">
            {searchResults.map((n) => (
              <li key={n.e164} className="flex items-center justify-between gap-3 px-3 py-3 text-sm">
                <div>
                  <p className="font-medium">{formatPhoneDisplay(n.e164)}</p>
                  <p className="text-xs text-muted-foreground">
                    {[n.locality, n.region, n.areaCode ? `(${n.areaCode})` : null]
                      .filter(Boolean)
                      .join(" · ") || "Available local number"}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => void purchaseNumber(n.e164)}
                  disabled={purchasing === n.e164}
                >
                  {purchasing === n.e164 ? "Buying…" : "Buy"}
                </Button>
              </li>
            ))}
            {!searchResults.length && (
              <li className="px-3 py-4 text-muted-foreground">
                {searching
                  ? "Searching Twilio inventory…"
                  : "Search to see available numbers matching your filters."}
              </li>
            )}
          </ul>
        </div>
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <div>
              <h3 className="font-semibold">Your numbers</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Edit title, company, type, and call flow inline. Texts to any of these numbers land in
                this company&apos;s SMS inbox so nothing is missed; replies always send from Primary.
                Primary is also the default outbound caller ID. “SMS Capable” means Twilio lists SMS
                capability — for US delivery the number must also be on your A2P Messaging Service
                (see the A2P campaign tab).
                {showCompanyColumn
                  ? " Use the Company column to move a number to another business you operate; it will leave this list and appear under that company."
                  : ""}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-white">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[140px]">Phone number</TableHead>
                    {showCompanyColumn ? (
                      <TableHead className="min-w-[160px]">Company</TableHead>
                    ) : null}
                    <TableHead className="min-w-[160px]">Title</TableHead>
                    <TableHead className="min-w-[140px]">Type</TableHead>
                    <TableHead title="Twilio SMS capability — not the same as A2P approval. Outbound CRM texts use the Primary number.">
                      SMS
                    </TableHead>
                    <TableHead className="min-w-[150px]">Call flow</TableHead>
                    <TableHead className="min-w-[140px]">Source / agent</TableHead>
                    <TableHead>Linked</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedNumbers.map((n) => {
                    const onCurrentCompany = n.companyId === sessionCompanyId;
                    return (
                    <TableRow key={n.id}>
                      <TableCell>
                        <span className="font-medium tabular-nums">
                          {formatPhoneDisplay(n.e164)}
                        </span>
                        {n.isPrimary ? (
                          <Badge variant="secondary" className="ml-2 align-middle">
                            Primary
                          </Badge>
                        ) : null}
                      </TableCell>
                      {showCompanyColumn ? (
                        <TableCell>
            <select
                            className="h-9 w-full min-w-[150px] rounded-md border border-input bg-background px-2 text-sm"
                            value={n.companyId}
                            onChange={(e) => {
                              const next = e.target.value;
                              if (next === n.companyId) return;
                              void updateNumber(n.id, { companyId: next });
                            }}
                          >
                            {companies.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                </option>
              ))}
            </select>
                        </TableCell>
                      ) : null}
                      <TableCell>
                        <Input
                          placeholder="e.g. PPC Repair"
                          className="h-9"
                          defaultValue={n.friendlyName ?? ""}
                          key={`${n.id}-${n.friendlyName ?? ""}`}
                          onBlur={(e) => {
                            const next = e.target.value.trim() || null;
                            if (next === (n.friendlyName ?? null) || (!next && !n.friendlyName)) {
                              return;
                            }
                            void updateNumber(n.id, { friendlyName: next });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <select
                          className="h-9 w-full min-w-[130px] rounded-md border border-input bg-background px-2 text-sm"
                          value={n.isPrimary ? "PRIMARY" : n.numberType}
                          onChange={(e) => {
                            const next = e.target.value;
                            if (next === "PRIMARY") {
                              void updateNumber(n.id, {
                                isPrimary: true,
                                numberType: "PRIMARY",
                              });
                            } else {
                              void updateNumber(n.id, {
                                numberType: next,
                                ...(n.isPrimary ? { isPrimary: false } : {}),
                              });
                            }
                          }}
                        >
                          {NUMBER_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        {n.smsEnabled === true ? (
                          <div className="space-y-0.5">
                            <Badge variant="outline" className="border-green-300 text-green-800">
                              Capable
                            </Badge>
                            {n.isPrimary ? (
                              <p className="text-[10px] leading-snug text-muted-foreground">
                                Used for outbound CRM texts
                              </p>
                    ) : null}
                  </div>
                        ) : n.smsEnabled === false ? (
                          <Badge variant="outline" className="text-muted-foreground">
                            Off
                          </Badge>
                        ) : n.twilioSid ? (
                          <span className="text-xs text-muted-foreground">Unknown</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {onCurrentCompany ? (
                  <select
                            className="h-9 w-full min-w-[140px] rounded-md border border-input bg-background px-2 text-sm"
                    value={n.callFlowId ?? ""}
                    onChange={(e) =>
                              void updateNumber(n.id, { callFlowId: e.target.value || null })
                    }
                  >
                    <option value="">Default flow</option>
                    {flows.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {n.callFlow?.name ?? "Default flow"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {n.numberType === "AGENT_DIRECT" || n.assignedUser
                          ? (n.assignedUser?.name ?? "—")
                          : n.trackingSource || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {n.twilioSid ? "Twilio" : "Manual"}
                      </TableCell>
                      <TableCell className="text-right">
                        {!n.isPrimary ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              void updateNumber(n.id, {
                                isPrimary: true,
                                numberType: "PRIMARY",
                              })
                            }
                          >
                            Set primary
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Outbound caller ID</span>
                        )}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                  {!sortedNumbers.length ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={showCompanyColumn ? 9 : 8}
                        className="py-8 text-center text-muted-foreground"
                      >
                        No phone numbers yet. Add one below or buy from Twilio.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </section>

          <section>
            <form
              onSubmit={addNumber}
              className="space-y-4 rounded-lg border border-border bg-white p-6"
            >
              <div>
                <h3 className="font-semibold">Add number manually</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enter an existing number you already own (not purchased through Twilio here).
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Phone number</label>
                  <Input
                    placeholder="+18015550100"
                    value={e164}
                    onChange={(e) => setE164(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Title</label>
                  <Input
                    placeholder="e.g. PPC Repair tracking"
                    value={friendlyName}
                    onChange={(e) => setFriendlyName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Type</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={numberType}
                    onChange={(e) => {
                      const next = e.target.value;
                      setNumberType(next);
                      if (next === "PRIMARY") setIsPrimary(true);
                    }}
                  >
                    {NUMBER_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Call flow</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={callFlowId}
                    onChange={(e) => setCallFlowId(e.target.value)}
                  >
                    <option value="">Default flow (ring agents)</option>
                    {flows.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                {numberType === "TRACKING" ? (
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-sm font-medium">Tracking source</label>
                    <Input
                      placeholder="e.g. Google Ads"
                      value={trackingSource}
                      onChange={(e) => setTrackingSource(e.target.value)}
                    />
                  </div>
                ) : null}
                {numberType === "AGENT_DIRECT" ? (
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-sm font-medium">Assign to employee</label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={assignedUserId}
                      onChange={(e) => setAssignedUserId(e.target.value)}
                    >
                      <option value="">Select employee</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={isPrimary || numberType === "PRIMARY"}
                  onCheckedChange={(c) => {
                    const on = Boolean(c);
                    setIsPrimary(on);
                    if (on) setNumberType("PRIMARY");
                    else if (numberType === "PRIMARY") setNumberType("TRACKING");
                  }}
                />
                Set as primary (only one allowed)
              </label>
              <Button type="submit">Add number</Button>
            </form>
          </section>
        </div>
      )}
    </ContentArea>
  );
}
