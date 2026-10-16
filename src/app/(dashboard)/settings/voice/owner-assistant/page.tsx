"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { formatPhoneDisplay } from "@/lib/inbox/phone";

type Availability = { mode: "ALWAYS" } | { mode: "CUSTOM"; timeZone: string; days: number[]; start: string; end: string };
type Data = {
  config: null | { enabled: boolean; name: string; authorizedPhoneE164: string | null; hasPin: boolean; voice: string; availability: Availability; maxCallMinutes: number; phoneNumber: null | { e164: string; smsEnabled: boolean | null; voiceEnabled: boolean | null } };
  companies: Array<{ id: string; name: string }>;
};
type Available = { e164: string; locality?: string | null; region?: string | null };

const VOICES = ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function OwnerAssistantSettingsPage() {
  const [challengeId, setChallengeId] = useState("");
  const [phoneMasked, setPhoneMasked] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState({ enabled: false, name: "Storm Assistant", authorizedPhoneE164: "", pin: "", voice: "alloy", maxCallMinutes: 12, availability: { mode: "ALWAYS" } as Availability });
  const [areaCodes, setAreaCodes] = useState("801");
  const [contains, setContains] = useState("");
  const [numbers, setNumbers] = useState<Available[]>([]);

  async function load(actionToken: string) {
    const response = await fetch("/api/settings/owner-assistant", { headers: { "x-owner-assistant-mfa": actionToken } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load settings");
    setData(payload);
    if (payload.config) setForm({ enabled: payload.config.enabled, name: payload.config.name, authorizedPhoneE164: payload.config.authorizedPhoneE164 || "", pin: "", voice: payload.config.voice, maxCallMinutes: payload.config.maxCallMinutes, availability: payload.config.availability || { mode: "ALWAYS" } });
  }

  async function startMfa() {
    setBusy(true);
    const response = await fetch("/api/settings/owner-assistant/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start" }) });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) return toast.error(payload.error || "Could not send verification code");
    setChallengeId(payload.challengeId); setPhoneMasked(payload.phoneMasked || "");
    if (payload.debugCode) setCode(payload.debugCode);
  }

  async function verifyMfa() {
    setBusy(true);
    const response = await fetch("/api/settings/owner-assistant/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", challengeId, code }) });
    const payload = await response.json();
    if (!response.ok) { setBusy(false); return toast.error(payload.error || "Verification failed"); }
    setToken(payload.actionToken);
    try { await load(payload.actionToken); } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to load"); }
    setBusy(false);
  }

  async function save() {
    setBusy(true);
    const response = await fetch("/api/settings/owner-assistant", { method: "PATCH", headers: { "Content-Type": "application/json", "x-owner-assistant-mfa": token }, body: JSON.stringify(form) });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) return toast.error(payload.error || "Save failed");
    setData(payload); setForm((current) => ({ ...current, pin: "" })); toast.success("Owner assistant settings saved");
  }

  async function search() {
    setBusy(true);
    const query = new URLSearchParams({ areaCodes, contains });
    const response = await fetch(`/api/settings/owner-assistant/number/search?${query}`, { headers: { "x-owner-assistant-mfa": token } });
    const payload = await response.json(); setBusy(false);
    if (!response.ok) return toast.error(payload.error || "Search failed");
    setNumbers(payload.numbers || []);
  }

  async function buy(e164: string) {
    if (!confirm(`Buy ${formatPhoneDisplay(e164)} for this private assistant? Twilio charges will begin immediately.`)) return;
    setBusy(true);
    const response = await fetch("/api/settings/owner-assistant/number/purchase", { method: "POST", headers: { "Content-Type": "application/json", "x-owner-assistant-mfa": token }, body: JSON.stringify({ e164 }) });
    const payload = await response.json();
    if (!response.ok) { setBusy(false); return toast.error(payload.error || "Purchase failed"); }
    await load(token); setBusy(false); setNumbers([]); toast.success("Assistant number purchased and attached to the shared A2P setup");
  }

  if (!token) return <ContentArea><PageHeader title="Owner assistant" subtitle="Private phone and text access to a limited CRM assistant." /><div className="max-w-xl rounded-xl border bg-card p-6"><h2 className="font-semibold">Two-factor verification required</h2><p className="mt-2 text-sm text-muted-foreground">Only an active administrator can view or change these settings.</p>{!challengeId ? <Button className="mt-4" onClick={startMfa} disabled={busy}>Send verification code</Button> : <div className="mt-4 space-y-3"><p className="text-sm">Code sent to {phoneMasked}.</p><Input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" placeholder="Verification code" /><Button onClick={verifyMfa} disabled={busy || !code}>Verify</Button></div>}</div></ContentArea>;

  const custom = form.availability.mode === "CUSTOM" ? form.availability : { mode: "CUSTOM" as const, timeZone: "America/Denver", days: [1, 2, 3, 4, 5], start: "08:00", end: "18:00" };
  return <ContentArea><PageHeader title="Owner assistant" subtitle="A private, admin-only assistant that responds only to your verified phone number." />
    <div className="grid max-w-4xl gap-6">
      <section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Identity and access</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm">Assistant name<Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label className="text-sm">Your only authorized phone<Input className="mt-1" value={form.authorizedPhoneE164} onChange={(e) => setForm({ ...form, authorizedPhoneE164: e.target.value })} placeholder="+18015551234" /></label><label className="text-sm">New 6–10 digit call PIN<Input className="mt-1" type="password" inputMode="numeric" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} placeholder={data?.config?.hasPin ? "Leave blank to keep current PIN" : "Required before enabling"} /></label><label className="text-sm">Voice<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={form.voice} onChange={(e) => setForm({ ...form, voice: e.target.value })}>{VOICES.map((voice) => <option key={voice}>{voice}</option>)}</select></label></div>
        <label className="mt-4 flex items-center gap-2 text-sm"><Checkbox checked={form.enabled} onCheckedChange={(checked) => setForm({ ...form, enabled: checked === true })} />Enabled</label>
      </section>
      <section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Availability</h2><div className="mt-3 flex gap-4 text-sm"><label><input type="radio" checked={form.availability.mode === "ALWAYS"} onChange={() => setForm({ ...form, availability: { mode: "ALWAYS" } })} /> Always</label><label><input type="radio" checked={form.availability.mode === "CUSTOM"} onChange={() => setForm({ ...form, availability: custom })} /> Custom hours</label></div>{form.availability.mode === "CUSTOM" ? <div className="mt-4 space-y-3"><div className="flex flex-wrap gap-2">{DAYS.map((day, index) => <label key={day} className="flex items-center gap-1 text-sm"><Checkbox checked={custom.days.includes(index)} onCheckedChange={(checked) => setForm({ ...form, availability: { ...custom, days: checked ? [...custom.days, index] : custom.days.filter((value) => value !== index) } })} />{day}</label>)}</div><div className="grid gap-3 sm:grid-cols-3"><Input type="time" value={custom.start} onChange={(e) => setForm({ ...form, availability: { ...custom, start: e.target.value } })} /><Input type="time" value={custom.end} onChange={(e) => setForm({ ...form, availability: { ...custom, end: e.target.value } })} /><Input value={custom.timeZone} onChange={(e) => setForm({ ...form, availability: { ...custom, timeZone: e.target.value } })} /></div></div> : null}<label className="mt-4 block text-sm">Maximum call minutes<Input className="mt-1 max-w-32" type="number" min={5} max={30} value={form.maxCallMinutes} onChange={(e) => setForm({ ...form, maxCallMinutes: Number(e.target.value) })} /></label></section>
      <section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Companies</h2><p className="mt-1 text-sm text-muted-foreground">The assistant can use only companies where your linked account is an active administrator.</p><ul className="mt-3 list-inside list-disc text-sm">{data?.companies.map((company) => <li key={company.id}>{company.name}</li>)}</ul></section>
      <section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Private Twilio number</h2>{data?.config?.phoneNumber ? <p className="mt-3 text-sm">{formatPhoneDisplay(data.config.phoneNumber.e164)} · Voice {data.config.phoneNumber.voiceEnabled === false ? "unavailable" : "enabled"} · SMS {data.config.phoneNumber.smsEnabled === false ? "unavailable" : "enabled"}</p> : <><p className="mt-1 text-sm text-muted-foreground">Uses the same Twilio account and shared A2P campaign as your other CRM numbers.</p><div className="mt-3 flex flex-wrap gap-2"><Input className="max-w-40" value={areaCodes} onChange={(e) => setAreaCodes(e.target.value)} placeholder="Area codes" /><Input className="max-w-52" value={contains} onChange={(e) => setContains(e.target.value)} placeholder="Optional digits/vanity" /><Button variant="outline" onClick={search} disabled={busy}>Search numbers</Button></div><div className="mt-3 grid gap-2">{numbers.map((number) => <div key={number.e164} className="flex items-center justify-between rounded-md border p-3 text-sm"><span>{formatPhoneDisplay(number.e164)} {number.locality ? `· ${number.locality}, ${number.region || ""}` : ""}</span><Button size="sm" onClick={() => buy(number.e164)} disabled={busy}>Buy</Button></div>)}</div></>}</section>
      <div><Button onClick={save} disabled={busy}>Save settings</Button></div>
      <p className="text-xs text-muted-foreground">The assistant cannot directly contact anyone except your authorized number. Creating a visit can still trigger your existing customer notification automations after you explicitly confirm it.</p>
    </div>
  </ContentArea>;
}
