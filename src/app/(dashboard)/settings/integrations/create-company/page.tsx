"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

type CompanyRow = {
  id: string;
  name: string;
  bookingSlug: string | null;
  supportEmail: string | null;
  createdAt: string;
  userCount: number;
  isCurrent: boolean;
};

export default function CreateCompanyPage() {
  const { data: session, update } = useSession();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [busy, setBusy] = useState(false);
  const [createdAdminUserId, setCreatedAdminUserId] = useState<string | null>(null);

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

  const load = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!session?.user?.name) return;
    setAdminName((prev) => prev || session.user?.name || "");
  }, [session?.user?.name]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (adminPassword !== confirmPassword) {
      toast.error("Passwords do not match");
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
      await load();
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
        <h1 className="font-display text-2xl font-bold">Create company</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Add another brand in this CRM (for example Chestnut &amp; Cheer). Creates
          the company, an admin login, and optionally links it to your current
          account so you can use <strong>Switch accounts</strong>.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Already have the company?{" "}
          <Link href="/settings/integrations/account-links" className="underline">
            Link an existing account
          </Link>
          .
        </p>
      </div>

      {createdAdminUserId ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          Company created and linked.{" "}
          <button type="button" className="underline" onClick={() => void switchToNew()}>
            Switch to it now
          </button>
        </div>
      ) : null}

      <form onSubmit={(e) => void submit(e)} className="space-y-6 rounded-xl border border-border bg-card p-5">
        <div>
          <h2 className="font-semibold">Company</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              Company name *
              <Input
                className="mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Chestnut & Cheer"
                required
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
          <h2 className="font-semibold">Admin login</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            This is the login for the new company. Use the same email as your Storm
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
                required
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
                required
              />
            </label>
            <label className="text-sm sm:col-span-2">
              Admin mobile phone * (SMS login codes)
              <Input
                className="mt-1"
                value={adminPhone}
                onChange={(e) => setAdminPhone(e.target.value)}
                required
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
                required
                minLength={8}
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
                required
                minLength={8}
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

        <Button type="submit" disabled={busy || !name.trim() || !adminEmail.trim()}>
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
    </div>
  );
}
