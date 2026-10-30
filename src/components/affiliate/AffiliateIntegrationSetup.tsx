"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clipboard, KeyRound, Loader2, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Credential = {
  id: string;
  label: string;
  keyPrefix: string;
  enabled: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

type SetupData = {
  endpoint: string;
  importedCustomers: number;
  credentials: Credential[];
};

const emptyCustomer = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  address: "",
  leadSource: "Affiliate",
  notes: "",
};

export function AffiliateIntegrationSetup() {
  const [data, setData] = useState<SetupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rawKey, setRawKey] = useState("");
  const [testKey, setTestKey] = useState("");
  const [testOk, setTestOk] = useState(false);
  const [customer, setCustomer] = useState(emptyCustomer);

  const load = useCallback(async () => {
    const response = await fetch("/api/affiliate/integration");
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "Could not load integration setup");
    setData(body);
  }, []);

  useEffect(() => {
    void load().catch((error) => toast.error(error.message)).finally(() => setLoading(false));
  }, [load]);

  const sample = useMemo(() => JSON.stringify({
    first_name: "Jordan",
    last_name: "Smith",
    phone: "+18015551234",
    email: "jordan@example.com",
    address: "123 Main Street, Salt Lake City, UT 84101",
    lead_source: "Affiliate website",
    notes: "Requested a quote through the partner system",
  }, null, 2), []);

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  }

  async function generateKey() {
    setBusy(true);
    setTestOk(false);
    try {
      const response = await fetch("/api/affiliate/integration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Customer import" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not generate key");
      setRawKey(body.rawKey);
      setTestKey(body.rawKey);
      await load();
      toast.success("New API key generated. Existing keys were disabled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate key");
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(id: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/affiliate/integration/${id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not revoke key");
      await load();
      setRawKey("");
      setTestKey("");
      setTestOk(false);
      toast.success("API key revoked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke key");
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    if (!data?.endpoint || !testKey.trim()) return toast.error("Enter the API key to test");
    setBusy(true);
    setTestOk(false);
    try {
      const response = await fetch(data.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${testKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          first_name: "API",
          last_name: "Connection Test",
          lead_source: "Affiliate API test",
          dry_run: true,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Connection failed");
      setTestOk(true);
      toast.success(body.message ?? "Connection is working");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Connection failed");
    } finally {
      setBusy(false);
    }
  }

  async function addCustomer(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/affiliate/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customer),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = body.details
          ? Object.values(body.details as Record<string, string[]>).flat()[0]
          : null;
        throw new Error(detail || body.error || "Could not add customer");
      }
      setCustomer(emptyCustomer);
      await load();
      toast.success(`${body.customer.name} added to your pipeline`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add customer");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const activeKey = data?.credentials.find((credential) => credential.enabled);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Customer API setup</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Send customers from your system into the CRM, verify the connection, or add customers manually. Every customer is automatically attributed to your affiliate account.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Imported customers</p><p className="mt-1 text-3xl font-bold">{data?.importedCustomers ?? 0}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">API status</p><p className="mt-2 flex items-center gap-2 font-semibold">{activeKey ? <><CheckCircle2 className="h-5 w-5 text-emerald-600" />Active</> : "Not configured"}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Security</p><p className="mt-2 flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-emerald-600" />Hash-only storage</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Daily API limit</p><p className="mt-1 text-3xl font-bold">150</p><p className="text-xs text-muted-foreground">requests per local day</p></div>
      </div>

      <section className="rounded-xl border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-xl font-semibold">1. Copy your endpoint</h2><p className="mt-1 text-sm text-muted-foreground">Add this HTTPS endpoint to the system that will send customers.</p></div>
          <Button variant="outline" onClick={() => void copy(data?.endpoint ?? "", "Endpoint")}><Clipboard className="h-4 w-4" />Copy</Button>
        </div>
        <code className="mt-4 block overflow-x-auto rounded-lg bg-muted p-3 text-sm">{data?.endpoint}</code>
        <p className="mt-3 text-sm">Method: <code>POST</code> · Header: <code>Authorization: Bearer YOUR_API_KEY</code> · Content type: <code>application/json</code></p>
      </section>

      <section className="rounded-xl border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-xl font-semibold">2. Generate an API key</h2><p className="mt-1 text-sm text-muted-foreground">Generating a new key disables the previous key. The full key is shown once and is never stored in readable form.</p></div>
          <Button onClick={() => void generateKey()} disabled={busy}><KeyRound className="h-4 w-4" />{activeKey ? "Rotate key" : "Generate key"}</Button>
        </div>
        {rawKey ? <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950"><p className="font-semibold">Save this key now—it cannot be recovered later.</p><div className="mt-2 flex gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded bg-white p-2 text-xs">{rawKey}</code><Button variant="outline" size="sm" onClick={() => void copy(rawKey, "API key")}><Clipboard className="h-4 w-4" /></Button></div></div> : null}
        {data?.credentials.length ? <div className="mt-4 space-y-2">{data.credentials.map((credential) => <div key={credential.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><div><span className="font-mono">{credential.keyPrefix}…</span><span className="ml-2 text-muted-foreground">{credential.enabled ? "Active" : "Revoked"}{credential.lastUsedAt ? ` · Last used ${new Date(credential.lastUsedAt).toLocaleString()}` : " · Never used"}</span></div>{credential.enabled ? <Button variant="ghost" size="sm" onClick={() => void revokeKey(credential.id)} disabled={busy}><Trash2 className="h-4 w-4" />Revoke</Button> : null}</div>)}</div> : null}
      </section>

      <section className="rounded-xl border bg-card p-5 sm:p-6">
        <h2 className="text-xl font-semibold">3. Map the customer fields</h2>
        <p className="mt-1 text-sm text-muted-foreground">Snake case and camel case are both accepted. First and last name are required; all other fields are optional.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr><th className="p-3">Field</th><th className="p-3">Description</th></tr></thead><tbody>{[
            ["first_name", "Customer first name"], ["last_name", "Customer last name"], ["phone", "Phone number"], ["email", "Email address"], ["address", "Complete street address"], ["lead_source", "Source shown in the pipeline"], ["notes", "Internal customer notes"],
          ].map(([field, description]) => <tr key={field} className="border-t"><td className="p-3 font-mono">{field}</td><td className="p-3">{description}</td></tr>)}</tbody></table></div>
          <div><div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium">Example JSON</span><Button variant="ghost" size="sm" onClick={() => void copy(sample, "Example JSON")}><Clipboard className="h-4 w-4" />Copy</Button></div><pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{sample}</pre></div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5 sm:p-6">
        <h2 className="text-xl font-semibold">4. Test the connection</h2>
        <p className="mt-1 text-sm text-muted-foreground">This validates the key and field mapping without creating a customer.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row"><Input type="password" value={testKey} onChange={(event) => { setTestKey(event.target.value); setTestOk(false); }} placeholder="Paste your API key" autoComplete="off" /><Button onClick={() => void testConnection()} disabled={busy || !testKey.trim()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Run test</Button></div>
        {testOk ? <p className="mt-3 flex items-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-5 w-5" />Connection and field mapping are working.</p> : null}
      </section>

      <section className="rounded-xl border bg-card p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Add a customer manually</h2>
        <p className="mt-1 text-sm text-muted-foreground">This customer will be attributed to you exactly like an API import.</p>
        <form onSubmit={addCustomer} className="mt-5 grid gap-4 sm:grid-cols-2">
          {(["firstName", "lastName", "phone", "email", "address", "leadSource"] as const).map((field) => <label key={field} className={field === "address" ? "sm:col-span-2" : ""}><span className="text-sm font-medium">{{firstName:"First name",lastName:"Last name",phone:"Phone number",email:"Email address",address:"Address",leadSource:"Lead source"}[field]}{field === "firstName" || field === "lastName" ? " *" : ""}</span><Input className="mt-1" type={field === "email" ? "email" : field === "phone" ? "tel" : "text"} required={field === "firstName" || field === "lastName"} value={customer[field]} onChange={(event) => setCustomer((current) => ({ ...current, [field]: event.target.value }))} /></label>)}
          <label className="sm:col-span-2"><span className="text-sm font-medium">Notes</span><textarea className="mt-1 min-h-28 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={customer.notes} onChange={(event) => setCustomer((current) => ({ ...current, notes: event.target.value }))} /></label>
          <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add customer</Button></div>
        </form>
      </section>
    </div>
  );
}
