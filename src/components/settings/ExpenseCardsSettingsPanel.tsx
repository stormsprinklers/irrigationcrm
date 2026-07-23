"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ROLE_LABELS } from "@/lib/employees";
import {
  centsToDollars,
  dollarsToCents,
  type ExpenseCardControls,
} from "@/lib/expense-cards/controls";
import { encryptIssuingPin } from "@/lib/expense-cards/encrypt-pin";

type Employee = {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
};

type CardRow = {
  id: string;
  status: string;
  last4: string | null;
  dailyLimitCents: number | null;
  monthlyLimitCents: number | null;
  user: { id: string; name: string; email: string; role: string };
};

type RolePolicy = {
  role: string;
  dailyLimitCents: number | null;
  monthlyLimitCents: number | null;
  blockAtm: boolean | null;
  blockInternational: boolean | null;
  blockOnline: boolean | null;
  allowedCategories: string[];
};

type ActivityItem = {
  id: string;
  amount: number;
  currency: string;
  merchantName: string | null;
  created: number;
  cardLast4: string | null;
  employeeName: string | null;
  approved?: boolean;
  status?: string;
  type?: string;
};

type AutoTopUpSettings = {
  enabled: boolean;
  minBalanceCents: number;
  topUpAmountCents: number;
  achFallbackEnabled: boolean;
  lastAt: string | null;
  lastAmountCents: number | null;
  lastMethod: string | null;
  lastStatus: string | null;
  lastError: string | null;
  lastStripeId: string | null;
};

type FundingBalances = {
  currency: string;
  paymentsAvailableCents: number;
  issuingAvailableCents: number;
  pendingAchTopUpCents: number;
};

type Tab = "defaults" | "funding" | "roles" | "cards" | "activity";

function formatMoneyFromCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100
  );
}

const DEFAULT_AUTO_TOP_UP: AutoTopUpSettings = {
  enabled: false,
  minBalanceCents: 50000,
  topUpAmountCents: 100000,
  achFallbackEnabled: false,
  lastAt: null,
  lastAmountCents: null,
  lastMethod: null,
  lastStatus: null,
  lastError: null,
  lastStripeId: null,
};

export function ExpenseCardsSettingsPanel() {
  const [tab, setTab] = useState<Tab>("defaults");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [canMutate, setCanMutate] = useState(false);
  const [defaults, setDefaults] = useState<ExpenseCardControls | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [rolePolicies, setRolePolicies] = useState<RolePolicy[]>([]);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [issuePin, setIssuePin] = useState("");
  const [actionToken, setActionToken] = useState<string | null>(null);
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaPhone, setMfaPhone] = useState("");
  const [authorizations, setAuthorizations] = useState<ActivityItem[]>([]);
  const [transactions, setTransactions] = useState<ActivityItem[]>([]);
  const [editingRole, setEditingRole] = useState<string>("TECH");
  const [autoTopUp, setAutoTopUp] = useState<AutoTopUpSettings>(DEFAULT_AUTO_TOP_UP);
  const [balances, setBalances] = useState<FundingBalances | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/expense-cards");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load");
    setEnabled(Boolean(data.enabled));
    setCanMutate(Boolean(data.canMutate));
    setDefaults(data.defaults);
    setRoles(data.roles ?? []);
    setRolePolicies(data.rolePolicies ?? []);
    setCards(data.cards ?? []);
    setEmployees(data.employees ?? []);
    if (data.autoTopUp) {
      setAutoTopUp({
        ...DEFAULT_AUTO_TOP_UP,
        ...data.autoTopUp,
      });
    }
    setBalances(data.balances ?? null);
    setBalanceError(data.balanceError ?? null);
  }, []);

  useEffect(() => {
    load()
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (tab !== "activity") return;
    fetch("/api/settings/expense-cards/activity")
      .then((r) => r.json())
      .then((data) => {
        setAuthorizations(data.authorizations ?? []);
        setTransactions(data.transactions ?? []);
      })
      .catch(() => undefined);
  }, [tab]);

  const rolePolicyMap = useMemo(() => {
    const map = new Map<string, RolePolicy>();
    for (const p of rolePolicies) map.set(p.role, p);
    return map;
  }, [rolePolicies]);

  const currentRolePolicy = rolePolicyMap.get(editingRole);

  async function startMfa() {
    const res = await fetch("/api/settings/expense-cards/mfa", {
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

  async function verifyMfa() {
    if (!mfaChallengeId || !mfaCode.trim()) {
      toast.error("Enter the verification code");
      return;
    }
    const res = await fetch("/api/settings/expense-cards/mfa", {
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
    setActionToken(data.actionToken);
    setMfaChallengeId(null);
    setMfaCode("");
    toast.success("Verified — you can save changes for 10 minutes");
  }

  async function mutate(path: string, init: RequestInit) {
    if (!actionToken) {
      toast.error("Complete MFA verification before making changes");
      await startMfa();
      return null;
    }
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    headers.set("x-expense-card-mfa", actionToken);
    const res = await fetch(path, { ...init, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) {
        setActionToken(null);
        toast.error(data.error ?? "MFA expired — verify again");
        await startMfa();
      } else {
        toast.error(data.error ?? "Request failed");
      }
      return null;
    }
    return data;
  }

  async function saveDefaults() {
    if (!defaults) return;
    setSaving(true);
    try {
      const data = await mutate("/api/settings/expense-cards", {
        method: "PATCH",
        body: JSON.stringify({ enabled, defaults, actionToken }),
      });
      if (!data) return;
      toast.success("Program settings saved");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function saveFunding() {
    setSaving(true);
    try {
      const data = await mutate("/api/settings/expense-cards", {
        method: "PATCH",
        body: JSON.stringify({
          actionToken,
          autoTopUp: {
            enabled: autoTopUp.enabled,
            minBalanceCents: autoTopUp.minBalanceCents,
            topUpAmountCents: autoTopUp.topUpAmountCents,
            achFallbackEnabled: autoTopUp.achFallbackEnabled,
          },
        }),
      });
      if (!data) return;
      toast.success("Funding settings saved");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function runTopUpNow() {
    setSaving(true);
    try {
      const data = await mutate("/api/settings/expense-cards/funding", {
        method: "POST",
        body: JSON.stringify({ action: "run_now", actionToken }),
      });
      if (!data) return;
      const result = data.result as {
        action: string;
        reason: string;
        amountCents?: number;
        method?: string;
      };
      if (result.action === "transferred" || result.action === "ach_pending") {
        toast.success(
          result.amountCents
            ? `${result.reason} (${formatMoneyFromCents(result.amountCents)}${
                result.method ? ` via ${result.method === "ach_topup" ? "ACH" : "Stripe balance"}` : ""
              })`
            : result.reason
        );
      } else if (result.action === "skipped") {
        toast.message(result.reason);
      } else {
        toast.error(result.reason);
      }
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function saveRolePolicy() {
    setSaving(true);
    try {
      const policy = currentRolePolicy ?? {
        role: editingRole,
        dailyLimitCents: null,
        monthlyLimitCents: null,
        blockAtm: null,
        blockInternational: null,
        blockOnline: null,
        allowedCategories: [],
      };
      const data = await mutate("/api/settings/expense-cards", {
        method: "PATCH",
        body: JSON.stringify({ rolePolicy: { ...policy, role: editingRole }, actionToken }),
      });
      if (!data) return;
      toast.success("Role policy saved");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function issueCard() {
    if (!selectedEmployeeId) {
      toast.error("Select an employee");
      return;
    }
    if (issuePin && !/^\d{4}$/.test(issuePin)) {
      toast.error("PIN must be exactly 4 digits (or leave blank)");
      return;
    }
    setSaving(true);
    try {
      let encryptedPin: string | undefined;
      if (issuePin) {
        encryptedPin = await encryptIssuingPin(issuePin);
      }
      const data = await mutate("/api/settings/expense-cards/cards", {
        method: "POST",
        body: JSON.stringify({
          userId: selectedEmployeeId,
          actionToken,
          ...(encryptedPin ? { encryptedPin } : {}),
        }),
      });
      if (!data) return;
      toast.success(
        issuePin
          ? `Card issued (•••• ${data.card?.last4}). Share the PIN you chose with the employee securely — it is not stored.`
          : `Card issued (•••• ${data.card?.last4})`
      );
      setIssuePin("");
      setSelectedEmployeeId("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to issue card");
    } finally {
      setSaving(false);
    }
  }

  async function setCardStatus(cardId: string, status: "ACTIVE" | "INACTIVE" | "CANCELED") {
    setSaving(true);
    try {
      const data = await mutate(`/api/settings/expense-cards/cards/${cardId}`, {
        method: "PATCH",
        body: JSON.stringify({ status, actionToken }),
      });
      if (!data) return;
      toast.success(`Card ${status.toLowerCase()}`);
      await load();
    } finally {
      setSaving(false);
    }
  }

  function updateRoleField<K extends keyof RolePolicy>(key: K, value: RolePolicy[K]) {
    setRolePolicies((prev) => {
      const existing = prev.find((p) => p.role === editingRole);
      if (existing) {
        return prev.map((p) => (p.role === editingRole ? { ...p, [key]: value } : p));
      }
      return [
        ...prev,
        {
          role: editingRole,
          dailyLimitCents: null,
          monthlyLimitCents: null,
          blockAtm: null,
          blockInternational: null,
          blockOnline: null,
          allowedCategories: [],
          [key]: value,
        } as RolePolicy,
      ];
    });
  }

  if (loading || !defaults) {
    return (
      <ContentArea className="max-w-4xl">
        <PageHeader breadcrumb={["Settings", "Company Expense Cards"]} title="Company Expense Cards" />
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      </ContentArea>
    );
  }

  const employeesWithoutCard = employees.filter(
    (e) => !cards.some((c) => c.user.id === e.id && c.status !== "CANCELED")
  );

  return (
    <ContentArea className="max-w-4xl">
      <PageHeader
        breadcrumb={["Settings", "Company Expense Cards"]}
        title="Company Expense Cards"
        subtitle="Stripe Issuing virtual cards for fuel, vehicle maintenance, and supplier purchases. Digital-only — no physical cards. Card numbers are never stored in the CRM."
      />

      {!canMutate ? (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Only admins can enable the program, issue cards, or change limits.
        </p>
      ) : (
        <section className="mb-6 rounded-lg border border-border bg-white p-4">
          <h3 className="text-sm font-semibold">Admin verification (MFA)</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Creating cards and changing limits requires SMS verification. Token lasts 10 minutes.
          </p>
          {actionToken ? (
            <p className="mt-2 text-sm text-emerald-700">Verified — mutations unlocked</p>
          ) : mfaChallengeId ? (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium">Code sent to {mfaPhone}</label>
                <Input value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} className="w-40" />
              </div>
              <Button type="button" onClick={() => void verifyMfa()}>
                Verify
              </Button>
            </div>
          ) : (
            <Button type="button" className="mt-3" variant="outline" onClick={() => void startMfa()}>
              Send verification code
            </Button>
          )}
        </section>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["defaults", "Program defaults"],
            ["funding", "Funding"],
            ["roles", "Role policies"],
            ["cards", "Employee cards"],
            ["activity", "Activity"],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={tab === id ? "default" : "outline"}
            onClick={() => setTab(id)}
          >
            {label}
          </Button>
        ))}
      </div>

      {tab === "defaults" ? (
        <section className="space-y-4 rounded-lg border border-border bg-white p-4">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={enabled}
              disabled={!canMutate}
              onCheckedChange={(v) => setEnabled(Boolean(v))}
            />
            <label className="text-sm font-medium">Enable expense cards for this company</label>
          </div>
          <p className="text-xs text-muted-foreground">
            Cards are virtual only (never ordered as physical plastic). They can only be used while
            the employee is clocked in. Configure Issuing balance auto-refill on the Funding tab.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Daily spend limit (USD)</label>
              <Input
                type="number"
                min={0}
                step="0.01"
                disabled={!canMutate}
                value={centsToDollars(defaults.dailyLimitCents)}
                onChange={(e) =>
                  setDefaults({
                    ...defaults,
                    dailyLimitCents: dollarsToCents(Number(e.target.value) || 0),
                  })
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Monthly spend limit (USD)</label>
              <Input
                type="number"
                min={0}
                step="0.01"
                disabled={!canMutate}
                value={centsToDollars(defaults.monthlyLimitCents)}
                onChange={(e) =>
                  setDefaults({
                    ...defaults,
                    monthlyLimitCents: dollarsToCents(Number(e.target.value) || 0),
                  })
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            {(
              [
                ["blockAtm", "Block cash withdrawals / ATM"],
                ["blockInternational", "Block international purchases"],
                ["blockOnline", "Block online / keyed-in purchases"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  checked={defaults[key]}
                  disabled={!canMutate}
                  onCheckedChange={(v) => setDefaults({ ...defaults, [key]: Boolean(v) })}
                />
                <label className="text-sm">{label}</label>
              </div>
            ))}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Allowed merchant categories (Stripe category codes, comma-separated)
            </label>
            <textarea
              className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              disabled={!canMutate}
              value={defaults.allowedCategories.join(", ")}
              onChange={(e) =>
                setDefaults({
                  ...defaults,
                  allowedCategories: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Default preset targets fuel, auto service/parts, and hardware suppliers.
            </p>
          </div>
          {canMutate ? (
            <Button type="button" disabled={saving} onClick={() => void saveDefaults()}>
              {saving ? "Saving…" : "Save program defaults"}
            </Button>
          ) : null}
        </section>
      ) : null}

      {tab === "funding" ? (
        <section className="space-y-4 rounded-lg border border-border bg-white p-4">
          <div>
            <h3 className="text-sm font-semibold">Issuing balance auto-refill</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Prefer moving money from your Stripe Payments balance (invoice/card proceeds) into
              Issuing when the Issuing balance drops below a minimum. Optional ACH pull uses the bank
              linked in the Stripe Dashboard. Checked hourly by cron.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">Issuing available</p>
              <p className="text-lg font-semibold">
                {balances ? formatMoneyFromCents(balances.issuingAvailableCents) : "—"}
              </p>
            </div>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">Payments available</p>
              <p className="text-lg font-semibold">
                {balances ? formatMoneyFromCents(balances.paymentsAvailableCents) : "—"}
              </p>
            </div>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">Pending ACH top-ups</p>
              <p className="text-lg font-semibold">
                {balances ? formatMoneyFromCents(balances.pendingAchTopUpCents) : "—"}
              </p>
            </div>
          </div>
          {balanceError ? (
            <p className="text-sm text-amber-800">Could not load balances: {balanceError}</p>
          ) : null}

          <div className="flex items-center gap-2">
            <Checkbox
              checked={autoTopUp.enabled}
              disabled={!canMutate}
              onCheckedChange={(v) => setAutoTopUp({ ...autoTopUp, enabled: Boolean(v) })}
            />
            <label className="text-sm font-medium">Enable automatic top-up</label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Minimum Issuing balance (USD)</label>
              <Input
                type="number"
                min={0}
                step="0.01"
                disabled={!canMutate}
                value={centsToDollars(autoTopUp.minBalanceCents)}
                onChange={(e) =>
                  setAutoTopUp({
                    ...autoTopUp,
                    minBalanceCents: dollarsToCents(Number(e.target.value) || 0),
                  })
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Refill when available Issuing (plus pending ACH) falls below this.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Refill amount (USD)</label>
              <Input
                type="number"
                min={5}
                step="0.01"
                disabled={!canMutate}
                value={centsToDollars(autoTopUp.topUpAmountCents)}
                onChange={(e) =>
                  setAutoTopUp({
                    ...autoTopUp,
                    topUpAmountCents: dollarsToCents(Number(e.target.value) || 0),
                  })
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Amount moved each time (minimum $5).
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              checked={autoTopUp.achFallbackEnabled}
              disabled={!canMutate}
              onCheckedChange={(v) =>
                setAutoTopUp({ ...autoTopUp, achFallbackEnabled: Boolean(v) })
              }
            />
            <div>
              <label className="text-sm font-medium">ACH bank fallback</label>
              <p className="text-xs text-muted-foreground">
                If Payments balance cannot cover the refill, pull from the bank account linked for
                top-ups in Stripe Dashboard. ACH can take up to 5 business days.
              </p>
            </div>
          </div>

          {(autoTopUp.lastAt || autoTopUp.lastStatus) && (
            <div className="rounded-md border border-border px-3 py-2 text-sm">
              <p className="font-medium">Last top-up attempt</p>
              <p className="text-muted-foreground">
                {autoTopUp.lastAt
                  ? new Date(autoTopUp.lastAt).toLocaleString()
                  : "—"}
                {autoTopUp.lastStatus ? ` · ${autoTopUp.lastStatus}` : ""}
                {autoTopUp.lastMethod
                  ? ` · ${autoTopUp.lastMethod === "ach_topup" ? "ACH" : "Stripe balance"}`
                  : ""}
                {autoTopUp.lastAmountCents != null
                  ? ` · ${formatMoneyFromCents(autoTopUp.lastAmountCents)}`
                  : ""}
              </p>
              {autoTopUp.lastError ? (
                <p className="mt-1 text-amber-800">{autoTopUp.lastError}</p>
              ) : null}
            </div>
          )}

          {canMutate ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={saving} onClick={() => void saveFunding()}>
                {saving ? "Saving…" : "Save funding settings"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={saving || !enabled}
                onClick={() => void runTopUpNow()}
              >
                Top up now
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "roles" ? (
        <section className="space-y-4 rounded-lg border border-border bg-white p-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Role</label>
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={editingRole}
              onChange={(e) => setEditingRole(e.target.value)}
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            Leave fields blank to inherit company defaults. Role policies apply before per-employee
            overrides.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Daily limit (USD, optional)</label>
              <Input
                type="number"
                min={0}
                step="0.01"
                disabled={!canMutate}
                value={
                  currentRolePolicy?.dailyLimitCents != null
                    ? centsToDollars(currentRolePolicy.dailyLimitCents)
                    : ""
                }
                onChange={(e) =>
                  updateRoleField(
                    "dailyLimitCents",
                    e.target.value === "" ? null : dollarsToCents(Number(e.target.value) || 0)
                  )
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Monthly limit (USD, optional)</label>
              <Input
                type="number"
                min={0}
                step="0.01"
                disabled={!canMutate}
                value={
                  currentRolePolicy?.monthlyLimitCents != null
                    ? centsToDollars(currentRolePolicy.monthlyLimitCents)
                    : ""
                }
                onChange={(e) =>
                  updateRoleField(
                    "monthlyLimitCents",
                    e.target.value === "" ? null : dollarsToCents(Number(e.target.value) || 0)
                  )
                }
              />
            </div>
          </div>
          {(
            [
              ["blockAtm", "Block ATM"],
              ["blockInternational", "Block international"],
              ["blockOnline", "Block online"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2">
              <Checkbox
                checked={Boolean(currentRolePolicy?.[key])}
                disabled={!canMutate}
                onCheckedChange={(v) => updateRoleField(key, Boolean(v))}
              />
              <label className="text-sm">{label} (set override)</label>
            </div>
          ))}
          {canMutate ? (
            <Button type="button" disabled={saving} onClick={() => void saveRolePolicy()}>
              {saving ? "Saving…" : "Save role policy"}
            </Button>
          ) : null}
        </section>
      ) : null}

      {tab === "cards" ? (
        <section className="space-y-6">
          {canMutate ? (
            <div className="space-y-3 rounded-lg border border-border bg-white p-4">
              <h3 className="font-semibold">Issue virtual card</h3>
              <p className="text-xs text-muted-foreground">
                Cards are created manually — never automatically. Physical cards are never ordered.
              </p>
              <select
                className="h-9 w-full max-w-md rounded-md border border-input bg-transparent px-3 text-sm"
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
              >
                <option value="">Select employee…</option>
                {employeesWithoutCard.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({ROLE_LABELS[e.role as keyof typeof ROLE_LABELS] ?? e.role})
                  </option>
                ))}
              </select>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  PIN (optional, 4 digits — shown only here, never stored)
                </label>
                <Input
                  className="max-w-[140px]"
                  inputMode="numeric"
                  maxLength={4}
                  value={issuePin}
                  onChange={(e) => setIssuePin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="••••"
                />
              </div>
              <Button type="button" disabled={saving || !enabled} onClick={() => void issueCard()}>
                {saving ? "Issuing…" : "Issue card"}
              </Button>
              {!enabled ? (
                <p className="text-xs text-amber-700">Enable the program in Defaults first.</p>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-lg border border-border bg-white p-4">
            <h3 className="mb-3 font-semibold">Issued cards</h3>
            {cards.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cards issued yet.</p>
            ) : (
              <ul className="divide-y">
                {cards.map((card) => (
                  <li
                    key={card.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{card.user.name}</p>
                      <p className="text-muted-foreground">
                        •••• {card.last4 ?? "????"} · {card.status}
                        {card.dailyLimitCents != null
                          ? ` · daily ${formatMoneyFromCents(card.dailyLimitCents)}`
                          : ""}
                      </p>
                    </div>
                    {canMutate && card.status !== "CANCELED" ? (
                      <div className="flex flex-wrap gap-2">
                        {card.status === "ACTIVE" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={saving}
                            onClick={() => void setCardStatus(card.id, "INACTIVE")}
                          >
                            Freeze
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={saving}
                            onClick={() => void setCardStatus(card.id, "ACTIVE")}
                          >
                            Unfreeze
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={saving}
                          onClick={() => void setCardStatus(card.id, "CANCELED")}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {tab === "activity" ? (
        <section className="space-y-4">
          <div className="rounded-lg border border-border bg-white p-4">
            <h3 className="mb-3 font-semibold">Recent authorizations</h3>
            {authorizations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent authorizations.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {authorizations.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3 border-b pb-2 last:border-0">
                    <div>
                      <p className="font-medium">
                        {a.merchantName ?? "Merchant"} · {a.employeeName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(a.created * 1000).toLocaleString()} · •••• {a.cardLast4} ·{" "}
                        {a.approved ? "approved" : "declined"}
                      </p>
                    </div>
                    <span>{formatMoneyFromCents(a.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-lg border border-border bg-white p-4">
            <h3 className="mb-3 font-semibold">Recent transactions</h3>
            {transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent transactions.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {transactions.map((t) => (
                  <li key={t.id} className="flex justify-between gap-3 border-b pb-2 last:border-0">
                    <div>
                      <p className="font-medium">
                        {t.merchantName ?? "Merchant"} · {t.employeeName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(t.created * 1000).toLocaleString()} · •••• {t.cardLast4}
                      </p>
                    </div>
                    <span>{formatMoneyFromCents(t.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}
    </ContentArea>
  );
}
