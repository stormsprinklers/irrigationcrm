"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

export type PortInRow = {
  id: string;
  e164: string;
  twilioPortInRequestSid: string;
  status: string;
  portable: boolean | null;
  rejectionReason: string | null;
  rejectionReasonCode: string | null;
  notPortableReason: string | null;
  twilioDocumentSid: string | null;
  notificationEmails: string[];
  targetPortInDate: string | null;
  phoneNumberId: string | null;
  phoneNumber: { id: string; e164: string; isPrimary: boolean } | null;
  createdAt: string;
  updatedAt: string;
  isTerminal: boolean;
};

type PortDefaults = {
  customerName: string;
  accountTelephoneNumber: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  notificationEmails: string[];
  authorizedRepresentative: string;
  authorizedRepresentativeEmail: string;
};

type Portability = {
  e164: string;
  portable: boolean;
  pinRequired: boolean;
  numberType: string | null;
  blockedReason: string | null;
  notPortableReason: string | null;
};

const STEPS = [
  "Checklist",
  "Number",
  "Utility bill",
  "Account & LOA",
  "Port date",
  "Review",
] as const;

function defaultTargetDate() {
  const d = new Date();
  d.setDate(d.getDate() + 10);
  return d.toISOString().slice(0, 10);
}

function twilioConsoleUrl(sid: string) {
  return `https://console.twilio.com/us1/develop/phone-numbers/porting/port-ins/${encodeURIComponent(sid)}`;
}

export function PortNumberWizard({ onImported }: { onImported?: () => void }) {
  const [ports, setPorts] = useState<PortInRow[]>([]);
  const [defaults, setDefaults] = useState<PortDefaults | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const [checklistOk, setChecklistOk] = useState(false);
  const [e164Input, setE164Input] = useState("");
  const [portability, setPortability] = useState<Portability | null>(null);
  const [documentSid, setDocumentSid] = useState<string | null>(null);
  const [billFileName, setBillFileName] = useState<string | null>(null);
  const [customerType, setCustomerType] = useState<"Business" | "Individual">("Business");
  const [customerName, setCustomerName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountTelephoneNumber, setAccountTelephoneNumber] = useState("");
  const [pin, setPin] = useState("");
  const [street, setStreet] = useState("");
  const [street2, setStreet2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [authorizedRepresentative, setAuthorizedRepresentative] = useState("");
  const [authorizedRepresentativeEmail, setAuthorizedRepresentativeEmail] = useState("");
  const [notificationEmails, setNotificationEmails] = useState("");
  const [targetPortInDate, setTargetPortInDate] = useState(defaultTargetDate);
  const [timeStart, setTimeStart] = useState("");
  const [timeEnd, setTimeEnd] = useState("");
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const selected = useMemo(
    () => ports.find((p) => p.id === selectedId) ?? null,
    [ports, selectedId]
  );

  const loadPorts = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/settings/voice/numbers/port");
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to load ports");
        return;
      }
      setPorts(Array.isArray(data.ports) ? data.ports : []);
      return data.defaults as PortDefaults | undefined;
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const d = await loadPorts();
      if (!d) return;
      setDefaults(d);
      setCustomerName(d.customerName);
      setAccountTelephoneNumber(d.accountTelephoneNumber);
      setStreet(d.street);
      setCity(d.city);
      setState(d.state);
      setZip(d.zip);
      setAuthorizedRepresentative(d.authorizedRepresentative);
      setAuthorizedRepresentativeEmail(d.authorizedRepresentativeEmail);
      setNotificationEmails(d.notificationEmails.join(", "));
    })();
  }, [loadPorts]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("portId");
    if (id) setSelectedId(id);
  }, []);

  async function checkPortability() {
    setBusy(true);
    setPortability(null);
    try {
      const res = await fetch("/api/settings/voice/numbers/port/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ e164: e164Input }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Portability check failed");
        return;
      }
      setPortability(data);
      if (!data.portable) {
        toast.error(data.blockedReason ?? "Number is not portable");
      } else {
        toast.success("Number is portable");
      }
    } finally {
      setBusy(false);
    }
  }

  async function uploadBill(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/settings/voice/numbers/port/documents", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Upload failed");
        return;
      }
      setDocumentSid(data.documentSid);
      setBillFileName(file.name);
      toast.success("Utility bill uploaded to Twilio");
    } finally {
      setBusy(false);
    }
  }

  async function submitPort() {
    if (!portability?.portable || !documentSid) return;
    setBusy(true);
    try {
      const res = await fetch("/api/settings/voice/numbers/port", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          e164: portability.e164,
          documentSid,
          pin: pin || null,
          customerType,
          customerName,
          accountNumber,
          accountTelephoneNumber,
          street,
          street2: street2 || null,
          city,
          state,
          zip,
          authorizedRepresentative,
          authorizedRepresentativeEmail,
          notificationEmails: notificationEmails
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          targetPortInDate,
          targetPortInTimeRangeStart: timeStart || null,
          targetPortInTimeRangeEnd: timeEnd || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to create port-in request");
        return;
      }
      toast.success("Port-in request created — check email to sign the LOA");
      setSubmittedId(data.id);
      setSelectedId(data.id);
      await loadPorts();
      setStep(0);
    } finally {
      setBusy(false);
    }
  }

  async function refreshPort(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/settings/voice/numbers/port/${id}/refresh`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Refresh failed");
        return;
      }
      setPorts((prev) => prev.map((p) => (p.id === id ? data : p)));
      if (data.phoneNumberId) {
        toast.success("Port completed — number imported");
        onImported?.();
      } else {
        toast.success(`Status: ${data.status}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function cancelPort(id: string) {
    if (!confirm("Cancel this port-in request with Twilio?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/settings/voice/numbers/port/${id}/cancel`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Cancel failed");
        return;
      }
      setPorts((prev) => prev.map((p) => (p.id === id ? data : p)));
      toast.success("Port request canceled");
    } finally {
      setBusy(false);
    }
  }

  function canNext(): boolean {
    if (step === 0) return checklistOk;
    if (step === 1) return Boolean(portability?.portable);
    if (step === 2) return Boolean(documentSid);
    if (step === 3) {
      const base =
        customerName &&
        accountNumber &&
        accountTelephoneNumber &&
        street &&
        city &&
        state &&
        zip &&
        authorizedRepresentative &&
        authorizedRepresentativeEmail.includes("@");
      if (!base) return false;
      if (portability?.pinRequired && !pin.trim()) return false;
      return true;
    }
    if (step === 4) return Boolean(targetPortInDate);
    return true;
  }

  function startNew() {
    setSelectedId(null);
    setSubmittedId(null);
    setStep(0);
    setChecklistOk(false);
    setE164Input("");
    setPortability(null);
    setDocumentSid(null);
    setBillFileName(null);
    setPin("");
    setAccountNumber("");
    setTargetPortInDate(defaultTargetDate());
    if (defaults) {
      setCustomerName(defaults.customerName);
      setAccountTelephoneNumber(defaults.accountTelephoneNumber);
      setStreet(defaults.street);
      setCity(defaults.city);
      setState(defaults.state);
      setZip(defaults.zip);
      setAuthorizedRepresentative(defaults.authorizedRepresentative);
      setAuthorizedRepresentativeEmail(defaults.authorizedRepresentativeEmail);
      setNotificationEmails(defaults.notificationEmails.join(", "));
    }
  }

  if (selected) {
    const showCarrierWarning = !selected.isTerminal;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setSelectedId(null)}>
            ← Back to ports
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={startNew}>
            Start new port
          </Button>
        </div>

        {showCarrierWarning ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Do not cancel your current phone service until this port shows as{" "}
            <strong>Completed</strong>. Canceling early can disconnect the number.
          </div>
        ) : null}

        <div className="space-y-3 rounded-lg border border-border bg-white p-6 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-lg font-semibold">{selected.e164}</p>
              <p className="text-muted-foreground">
                Twilio SID: {selected.twilioPortInRequestSid}
              </p>
            </div>
            <Badge variant="secondary">{selected.status}</Badge>
          </div>

          {selected.rejectionReason ? (
            <p className="text-destructive">
              Rejection: {selected.rejectionReason}
              {selected.rejectionReasonCode
                ? ` (code ${selected.rejectionReasonCode})`
                : ""}
            </p>
          ) : null}
          {selected.notPortableReason ? (
            <p className="text-destructive">Not portable: {selected.notPortableReason}</p>
          ) : null}

          <p className="text-muted-foreground">
            Target date: {selected.targetPortInDate ?? "—"} · Updated{" "}
            {new Date(selected.updatedAt).toLocaleString()}
          </p>

          {selected.phoneNumberId ? (
            <p>
              Imported into CRM as{" "}
              <a className="underline" href="/settings/voice/numbers">
                {selected.phoneNumber?.e164 ?? selected.e164}
              </a>
              {selected.phoneNumber?.isPrimary ? " (primary)" : ""}.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type="button"
              size="sm"
              onClick={() => refreshPort(selected.id)}
              disabled={busy}
            >
              Refresh status
            </Button>
            {!selected.isTerminal ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => cancelPort(selected.id)}
                disabled={busy}
              >
                Cancel port
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" asChild>
              <a
                href={twilioConsoleUrl(selected.twilioPortInRequestSid)}
                target="_blank"
                rel="noreferrer"
              >
                Open Twilio Console
              </a>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Do not cancel your current carrier until the port completes. Twilio Porting API is Public
        Beta (no SLA) — status updates arrive via webhook.
      </div>

      {submittedId ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          Port request submitted. The authorized representative must sign the e-LOA email from
          Twilio (about 30 days to sign).{" "}
          <button
            type="button"
            className="underline"
            onClick={() => setSelectedId(submittedId)}
          >
            View status
          </button>
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-white p-6">
        <div className="mb-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {STEPS.map((label, i) => (
            <span
              key={label}
              className={
                i === step
                  ? "font-semibold text-foreground"
                  : i < step
                    ? "text-foreground/70"
                    : undefined
              }
            >
              {i + 1}. {label}
              {i < STEPS.length - 1 ? " ·" : ""}
            </span>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-3 text-sm">
            <h3 className="font-semibold">Before you start</h3>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Keep your current phone service active until the port completes.</li>
              <li>Have a recent utility bill (PDF/JPG/PNG, ≤10MB, dated within 30 days).</li>
              <li>Name and billing address must match your losing carrier exactly.</li>
              <li>Expect 5–15+ days; Twilio or the carrier may adjust the port date.</li>
              <li>
                An authorized representative must be able to open email and sign Twilio&apos;s
                electronic LOA.
              </li>
              <li>US landline/mobile only — not toll-free (use Twilio Console for those).</li>
            </ul>
            <label className="flex items-center gap-2 pt-2">
              <Checkbox
                checked={checklistOk}
                onCheckedChange={(c) => setChecklistOk(Boolean(c))}
              />
              I understand and have the documents ready
            </label>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <h3 className="font-semibold">Number to port</h3>
            <Input
              placeholder="+18015551212"
              value={e164Input}
              onChange={(e) => {
                setE164Input(e.target.value);
                setPortability(null);
              }}
            />
            <Button type="button" onClick={checkPortability} disabled={busy || !e164Input.trim()}>
              Check portability
            </Button>
            {portability ? (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                {portability.portable ? (
                  <p>
                    Portable · type {portability.numberType ?? "unknown"}
                    {portability.pinRequired ? " · PIN required from losing carrier" : ""}
                  </p>
                ) : (
                  <p className="text-destructive">
                    {portability.blockedReason ??
                      portability.notPortableReason ??
                      "Not portable"}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 text-sm">
            <h3 className="font-semibold">Utility bill</h3>
            <p className="text-muted-foreground">
              Upload a recent bill (≤30 days old) showing the number and account holder. PDF, JPG,
              or PNG · max 10MB.
            </p>
            <Input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadBill(file);
              }}
              disabled={busy}
            />
            {documentSid ? (
              <p className="text-muted-foreground">
                Uploaded {billFileName} · Twilio document {documentSid}
              </p>
            ) : null}
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <h3 className="font-semibold sm:col-span-2">Losing carrier & authorized rep</h3>
            <label className="text-sm sm:col-span-2">
              Customer type
              <select
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={customerType}
                onChange={(e) =>
                  setCustomerType(e.target.value === "Individual" ? "Individual" : "Business")
                }
              >
                <option value="Business">Business</option>
                <option value="Individual">Individual</option>
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              Customer name (as on carrier account)
              <Input
                className="mt-1"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Account number
              <Input
                className="mt-1"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Account telephone number
              <Input
                className="mt-1"
                value={accountTelephoneNumber}
                onChange={(e) => setAccountTelephoneNumber(e.target.value)}
              />
            </label>
            {(portability?.pinRequired ||
              (portability?.numberType ?? "").toUpperCase().includes("MOBILE")) && (
              <label className="text-sm sm:col-span-2">
                Mobile / port PIN (from losing carrier)
                <Input
                  className="mt-1"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  autoComplete="off"
                />
              </label>
            )}
            <label className="text-sm sm:col-span-2">
              Billing street
              <Input className="mt-1" value={street} onChange={(e) => setStreet(e.target.value)} />
            </label>
            <label className="text-sm sm:col-span-2">
              Street line 2
              <Input
                className="mt-1"
                value={street2}
                onChange={(e) => setStreet2(e.target.value)}
              />
            </label>
            <label className="text-sm">
              City
              <Input className="mt-1" value={city} onChange={(e) => setCity(e.target.value)} />
            </label>
            <label className="text-sm">
              State
              <Input className="mt-1" value={state} onChange={(e) => setState(e.target.value)} />
            </label>
            <label className="text-sm">
              ZIP
              <Input className="mt-1" value={zip} onChange={(e) => setZip(e.target.value)} />
            </label>
            <label className="text-sm sm:col-span-2">
              Authorized representative name
              <Input
                className="mt-1"
                value={authorizedRepresentative}
                onChange={(e) => setAuthorizedRepresentative(e.target.value)}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              Authorized representative email (receives e-LOA)
              <Input
                className="mt-1"
                type="email"
                value={authorizedRepresentativeEmail}
                onChange={(e) => setAuthorizedRepresentativeEmail(e.target.value)}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              Notification emails (comma-separated)
              <Input
                className="mt-1"
                value={notificationEmails}
                onChange={(e) => setNotificationEmails(e.target.value)}
              />
            </label>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3 text-sm">
            <h3 className="font-semibold">Desired port date</h3>
            <p className="text-muted-foreground">
              Pick a date at least 5–7 business days out. Your losing carrier or Twilio may change
              it.
            </p>
            <Input
              type="date"
              value={targetPortInDate}
              onChange={(e) => setTargetPortInDate(e.target.value)}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                Preferred window start (optional)
                <Input
                  className="mt-1"
                  placeholder="10:00:00-07:00"
                  value={timeStart}
                  onChange={(e) => setTimeStart(e.target.value)}
                />
              </label>
              <label>
                Preferred window end (optional)
                <Input
                  className="mt-1"
                  placeholder="17:00:00-07:00"
                  value={timeEnd}
                  onChange={(e) => setTimeEnd(e.target.value)}
                />
              </label>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-2 text-sm">
            <h3 className="font-semibold">Review & submit</h3>
            <ul className="space-y-1 text-muted-foreground">
              <li>Number: {portability?.e164}</li>
              <li>Document: {documentSid}</li>
              <li>
                Customer: {customerName} ({customerType})
              </li>
              <li>Account #: {accountNumber}</li>
              <li>
                Address: {street}, {city}, {state} {zip}
              </li>
              <li>
                LOA: {authorizedRepresentative} &lt;{authorizedRepresentativeEmail}&gt;
              </li>
              <li>Target date: {targetPortInDate}</li>
            </ul>
            <p className="pt-2 text-amber-900">
              After submit, Twilio emails the e-LOA. Leave current service active until Completed.
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={step === 0 || busy}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              type="button"
              disabled={!canNext() || busy}
              onClick={() => setStep((s) => s + 1)}
            >
              Continue
            </Button>
          ) : (
            <Button type="button" disabled={!canNext() || busy} onClick={() => void submitPort()}>
              {busy ? "Submitting…" : "Submit port-in request"}
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-white">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="font-semibold text-sm">Port requests</h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void loadPorts()}
            disabled={loadingList}
          >
            {loadingList ? "Loading…" : "Reload"}
          </Button>
        </div>
        <ul className="divide-y divide-border">
          {ports.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
            >
              <button
                type="button"
                className="text-left"
                onClick={() => setSelectedId(p.id)}
              >
                <span className="font-medium">{p.e164}</span>
                <span className="ml-2 text-muted-foreground">{p.status}</span>
                {p.phoneNumberId ? (
                  <Badge className="ml-2" variant="secondary">
                    Imported
                  </Badge>
                ) : null}
              </button>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => refreshPort(p.id)}
                >
                  Refresh
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setSelectedId(p.id)}>
                  Details
                </Button>
              </div>
            </li>
          ))}
          {!ports.length && !loadingList ? (
            <li className="px-4 py-6 text-sm text-muted-foreground">No port requests yet.</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
