"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { trueRoleOf } from "@/lib/role-preview";

type CompanyRow = {
  id: string;
  name: string;
  bookingSlug: string | null;
  supportEmail: string | null;
  createdAt: string;
  userCount: number;
  isCurrent: boolean;
};

type SearchUser = {
  id: string;
  name: string;
  email: string;
  companyName: string;
};

function missingRequiredFields(params: {
  name: string;
  adminName: string;
  adminEmail: string;
  adminPhone: string;
  adminPassword: string;
  confirmPassword: string;
}) {
  const missing: string[] = [];
  if (!params.name.trim()) missing.push("Company name");
  if (!params.adminName.trim()) missing.push("Admin name");
  if (!params.adminEmail.trim()) missing.push("Admin email");
  else if (!params.adminEmail.includes("@")) {
    missing.push("Admin email (needs a valid email)");
  }
  if (!params.adminPhone.trim()) missing.push("Admin mobile phone");
  if (!params.adminPassword.trim()) missing.push("Password");
  else if (params.adminPassword.trim().length < 8) {
    missing.push("Password (at least 8 characters)");
  }
  if (!params.confirmPassword.trim()) missing.push("Confirm password");
  else if (params.adminPassword !== params.confirmPassword) {
    missing.push("Confirm password (must match password)");
  }
  return missing;
}

export default function CompanyAccountsPage() {
  const { data: session, update } = useSession();
  const isAdmin = session?.user ? trueRoleOf(session.user) === "ADMIN" : false;

  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [busy, setBusy] = useState(false);
  const [createdAdminUserId, setCreatedAdminUserId] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);

  const [linkEmail, setLinkEmail] = useState("");
  const [linkResult, setLinkResult] = useState<string | null>(null);
  const [linked, setLinked] = useState<
    { userId: string; email: string; companyName: string }[]
  >([]);
  const [linkBusy, setLinkBusy] = useState(false);

  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [industry, setIndustry] = useState("");
  const [phone, setPhone] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("UT");
  const [zip, setZip] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [linkToMyAccount, setLinkToMyAccount] = useState(true);

  const missing = useMemo(
    () =>
      missingRequiredFields({
        name,
        adminName,
        adminEmail,
        adminPhone,
        adminPassword,
        confirmPassword,
      }),
    [name, adminName, adminEmail, adminPhone, adminPassword, confirmPassword]
  );

  const loadCompanies = useCallback(async () => {
    if (!isAdmin) {
      setLoadingList(false);
      return;
    }
    setLoadingList(true);
    try {
      const res = await fetch("/api/settings/companies");
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to load companies");
        return;
      }
      setCompanies(Array.isArray(data.companies) ? data.companies : []);
    } finally {
      setLoadingList(false);
    }
  }, [isAdmin]);

  const loadLinked = useCallback(async () => {
    const res = await fetch("/api/account/companies");
    if (!res.ok) return;
    const data = await res.json();
    setLinked(data.linked ?? []);
  }, []);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    void loadLinked();
  }, [loadLinked]);

  useEffect(() => {
    if (!session?.user?.name) return;
    setAdminName((prev) => prev || session.user?.name || "");
  }, [session?.user?.name]);

  async function linkByEmail() {
    setLinkBusy(true);
    setLinkResult(null);
    try {
      const findRes = await fetch(
        `/api/account/companies/find?email=${encodeURIComponent(linkEmail.trim())}`
      );
      const found = (await findRes.json()) as SearchUser & { error?: string };
      if (!findRes.ok) {
        setLinkResult(found.error ?? "User not found");
        return;
      }
      const res = await fetch("/api/account/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedUserId: found.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLinkResult(data.error ?? "Link failed");
        return;
      }
      setLinkResult(`Linked to ${found.companyName} (${found.email})`);
      setLinkEmail("");
      await loadLinked();
    } catch {
      setLinkResult("Network error");
    } finally {
      setLinkBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setShowMissing(true);
    const stillMissing = missingRequiredFields({
      name,
      adminName,
      adminEmail,
      adminPhone,
      adminPassword,
      confirmPassword,
    });
    if (stillMissing.length) {
      toast.error(`Missing or invalid: ${stillMissing.join(", ")}`);
      return;
    }

    setBusy(true);
    setCreatedAdminUserId(null);
    try {
      const res = await fetch("/api/settings/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          legalName: legalName || null,
          industry: industry || null,
          phone: phone || null,
          supportEmail: supportEmail || null,
          website: website || null,
          address: address || null,
          city: city || null,
          state: state || null,
          zip: zip || null,
          adminName,
          adminEmail,
          adminPhone,
          adminPassword,
          linkToMyAccount,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to create company");
        return;
      }
      toast.success(`Created ${data.company.name}`);
      setCreatedAdminUserId(data.admin?.id ?? null);
      setShowMissing(false);
      setName("");
      setLegalName("");
      setIndustry("");
      setPhone("");
      setSupportEmail("");
      setWebsite("");
      setAddress("");
      setCity("");
      setZip("");
      setAdminPassword("");
      setConfirmPassword("");
      await loadCompanies();
      await loadLinked();
    } finally {
      setBusy(false);
    }
  }

  async function switchToNew() {
    if (!createdAdminUserId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/account/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: createdAdminUserId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not switch accounts");
        return;
      }
      await update({
        user: {
          id: data.session.id,
          email: data.session.email,
          name: data.session.name,
          companyId: data.session.companyId,
          role: data.session.role,
          trueRole: null,
        },
      });
      window.location.href = "/home";
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Company accounts</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Link logins across brands and create new companies in this CRM. After linking,
          use <strong>Switch accounts</strong> in the avatar menu to hop between them.
        </p>
      </div>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div>
          <h2 className="font-semibold">Link an existing account</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Connect your login to a staff user on another company so it appears under Switch
            accounts.
          </p>
        </div>

        {linkResult ? (
          <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
            {linkResult}
          </p>
        ) : null}

        <label className="block text-sm font-medium">
          Other company staff email
          <Input
            className="mt-1"
            value={linkEmail}
            onChange={(e) => setLinkEmail(e.target.value)}
            placeholder="admin@utah.christmas"
            type="email"
          />
        </label>
        <Button
          type="button"
          disabled={!linkEmail.trim() || linkBusy}
          onClick={() => void linkByEmail()}
        >
          {linkBusy ? "Linking…" : "Link accounts"}
        </Button>

        <div>
          <h3 className="text-sm font-medium">Linked companies</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {linked.length === 0 ? (
              <li className="text-muted-foreground">No linked accounts yet.</li>
            ) : (
              linked.map((l) => (
                <li key={l.userId} className="rounded-md border border-border px-3 py-2">
                  {l.companyName} · {l.email}
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      {isAdmin ? (
        <>
          {createdAdminUserId ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
              Company created and linked.{" "}
              <button type="button" className="underline" onClick={() => void switchToNew()}>
                Switch to it now
              </button>
            </div>
          ) : null}

          <form
            onSubmit={(e) => void submit(e)}
            className="space-y-6 rounded-xl border border-border bg-card p-5"
            noValidate
          >
            <div>
              <h2 className="font-semibold">Create company</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Add another brand in this CRM. Creates the company, an admin login, and
                optionally links it to your current account.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-medium">Company</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm sm:col-span-2">
                  Company name *
                  <Input
                    className="mt-1"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Chestnut & Cheer"
                    autoComplete="organization"
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  Legal name
                  <Input
                    className="mt-1"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    placeholder="Chestnut & Cheer Christmas Lights"
                  />
                </label>
                <label className="text-sm">
                  Industry
                  <Input
                    className="mt-1"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="Christmas Light Installation"
                  />
                </label>
                <label className="text-sm">
                  Company phone
                  <Input
                    className="mt-1"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="385-999-6887"
                  />
                </label>
                <label className="text-sm">
                  Support email
                  <Input
                    className="mt-1"
                    type="email"
                    value={supportEmail}
                    onChange={(e) => setSupportEmail(e.target.value)}
                    placeholder="hello@utah.christmas"
                  />
                </label>
                <label className="text-sm">
                  Website
                  <Input
                    className="mt-1"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://utah.christmas"
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  Street address
                  <Input
                    className="mt-1"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
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
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium">Admin login</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                This is the login for the new company. Use the same email as your current
                account if you want automatic switching without linking; otherwise we&apos;ll
                link the accounts for you.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm sm:col-span-2">
                  Admin name *
                  <Input
                    className="mt-1"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    autoComplete="name"
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  Admin email *
                  <Input
                    className="mt-1"
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="admin@utah.christmas"
                    autoComplete="email"
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  Admin mobile phone * (SMS login codes)
                  <Input
                    className="mt-1"
                    value={adminPhone}
                    onChange={(e) => setAdminPhone(e.target.value)}
                    autoComplete="tel"
                  />
                </label>
                <label className="text-sm">
                  Password *
                  <Input
                    className="mt-1"
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
                <label className="text-sm">
                  Confirm password *
                  <Input
                    className="mt-1"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm">
                <Checkbox
                  checked={linkToMyAccount}
                  onCheckedChange={(c) => setLinkToMyAccount(Boolean(c))}
                />
                Link to my current account (show under Switch accounts)
              </label>
            </div>

            {showMissing && missing.length > 0 ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                Still needed: {missing.join(", ")}
              </div>
            ) : null}

            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create company"}
            </Button>
          </form>

          <div>
            <h2 className="font-semibold">Companies in this CRM</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {loadingList ? (
                <li className="text-muted-foreground">Loading…</li>
              ) : companies.length === 0 ? (
                <li className="text-muted-foreground">No companies found.</li>
              ) : (
                companies.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                  >
                    <div>
                      <span className="font-medium">{c.name}</span>
                      {c.isCurrent ? (
                        <span className="ml-2 text-xs text-muted-foreground">Current</span>
                      ) : null}
                      <div className="text-xs text-muted-foreground">
                        {c.userCount} user{c.userCount === 1 ? "" : "s"}
                        {c.bookingSlug ? ` · /book/${c.bookingSlug}` : ""}
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
