"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Employee = { id: string; name: string; email: string; role: string };
type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
};
type Template = { id: string; name: string; channel?: string; slug?: string };

export default function CompanyImportPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [notificationTemplates, setNotificationTemplates] = useState<Template[]>([]);
  const [checklistTemplates, setChecklistTemplates] = useState<Template[]>([]);
  const [priceBookCategories, setPriceBookCategories] = useState<
    { id: string; name: string; type: string; itemCount: number; childCount: number }[]
  >([]);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({
    employees: new Set(),
    customers: new Set(),
    notificationTemplates: new Set(),
    checklistTemplates: new Set(),
    priceBookCategories: new Set(),
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/company-import");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Unable to load Storm data");
        return;
      }
      setEmployees(data.employees ?? []);
      setCustomers(data.customers ?? []);
      setNotificationTemplates(data.notificationTemplates ?? []);
      setChecklistTemplates(data.checklistTemplates ?? []);
      setPriceBookCategories(
        (data.priceBookCategories ?? []).map(
          (c: {
            id: string;
            name: string;
            type: string;
            _count?: { items: number; children: number };
          }) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            itemCount: c._count?.items ?? 0,
            childCount: c._count?.children ?? 0,
          })
        )
      );
    } catch {
      setError("Network error loading import data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (group: string, id: string) => {
    setSelected((prev) => {
      const next = new Set(prev[group] ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, [group]: next };
    });
  };

  const runImport = async (type: string) => {
    const ids = Array.from(selected[type] ?? []);
    if (!ids.length) return;
    setBusy(type);
    setResult(null);
    try {
      const res = await fetch("/api/settings/company-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ids }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult(data.error ?? "Import failed");
        return;
      }
      const created = data.created?.length ?? 0;
      const skipped = data.skipped?.length ?? 0;
      setResult(`Imported ${created}. Skipped ${skipped}.`);
      setSelected((prev) => ({ ...prev, [type]: new Set() }));
    } catch {
      setResult("Network error during import");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading Storm Sprinklers data…</div>;
  }

  if (error) {
    return (
      <div className="space-y-3 p-6">
        <h1 className="font-display text-2xl font-bold">Import from Storm Sprinklers</h1>
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </p>
        <p className="text-sm text-muted-foreground">
          Log in as an Admin on the Chestnut &amp; Cheer company to use this tool.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Import from Storm Sprinklers</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Copy selected employees, customers, and templates into Chestnut &amp; Cheer.
          Employees get a <code>+chestnut</code> email alias and must reset their password.
          Twilio numbers are not copied — configure messaging separately.
        </p>
      </div>

      {result ? (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">{result}</p>
      ) : null}

      <ImportSection
        title="Employees"
        description="Creates C&C user accounts (invite/reset required)."
        items={employees.map((e) => ({
          id: e.id,
          label: `${e.name} · ${e.email} · ${e.role}`,
        }))}
        selected={selected.employees}
        onToggle={(id) => toggle("employees", id)}
        onImport={() => runImport("employees")}
        busy={busy === "employees"}
      />

      <ImportSection
        title="Customers"
        description="Copies contact info, phones, and properties."
        items={customers.map((c) => ({
          id: c.id,
          label: `${c.name}${c.city ? ` · ${c.city}` : ""}${c.phone ? ` · ${c.phone}` : ""}`,
        }))}
        selected={selected.customers}
        onToggle={(id) => toggle("customers", id)}
        onImport={() => runImport("customers")}
        busy={busy === "customers"}
      />

      <ImportSection
        title="Notification templates"
        description="SMS/email message templates."
        items={notificationTemplates.map((t) => ({
          id: t.id,
          label: `${t.name}${t.channel ? ` · ${t.channel}` : ""}`,
        }))}
        selected={selected.notificationTemplates}
        onToggle={(id) => toggle("notificationTemplates", id)}
        onImport={() => runImport("notificationTemplates")}
        busy={busy === "notificationTemplates"}
      />

      <ImportSection
        title="Checklist templates"
        description="Visit checklist structures (price-book line links not copied)."
        items={checklistTemplates.map((t) => ({
          id: t.id,
          label: t.name,
        }))}
        selected={selected.checklistTemplates}
        onToggle={(id) => toggle("checklistTemplates", id)}
        onImport={() => runImport("checklistTemplates")}
        busy={busy === "checklistTemplates"}
      />

      <ImportSection
        title="Price book categories"
        description="Copies category + item structure (not labor rates or material links)."
        items={priceBookCategories.map((c) => ({
          id: c.id,
          label: `${c.name} · ${c.type} · ${c.itemCount} items${
            c.childCount ? ` · ${c.childCount} subcategories` : ""
          }`,
        }))}
        selected={selected.priceBookCategories}
        onToggle={(id) => toggle("priceBookCategories", id)}
        onImport={() => runImport("priceBookCategories")}
        busy={busy === "priceBookCategories"}
      />
    </div>
  );
}

function ImportSection({
  title,
  description,
  items,
  selected,
  onToggle,
  onImport,
  busy,
}: {
  title: string;
  description: string;
  items: { id: string; label: string }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onImport: () => void;
  busy: boolean;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!selected.size || busy}
          onClick={onImport}
        >
          {busy ? "Importing…" : `Import selected (${selected.size})`}
        </Button>
      </div>
      <ul className="mt-4 max-h-56 space-y-2 overflow-y-auto text-sm">
        {items.length === 0 ? (
          <li className="text-muted-foreground">No items found.</li>
        ) : (
          items.map((item) => (
            <li key={item.id}>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.has(item.id)}
                  onChange={() => onToggle(item.id)}
                />
                <span>{item.label}</span>
              </label>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
