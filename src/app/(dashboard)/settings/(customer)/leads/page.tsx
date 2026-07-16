"use client";

import { useState } from "react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompanySettings } from "@/components/settings/useCompanySettings";

export default function SettingsLeadsPage() {
  const { company, setCompany, loading, saving, save } = useCompanySettings();
  const [newSource, setNewSource] = useState("");

  if (loading || !company) {
    return (
      <ContentArea className="max-w-2xl">
        <PageHeader breadcrumb={["Settings", "Leads"]} title="Leads" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </ContentArea>
    );
  }

  function addSource() {
    if (!company || !newSource.trim()) return;
    setCompany({ ...company, leadSources: [...company.leadSources, newSource.trim()] });
    setNewSource("");
  }

  return (
    <ContentArea className="max-w-2xl">
      <PageHeader
        breadcrumb={["Settings", "Leads"]}
        title="Leads"
        actions={<Button size="sm" onClick={() => save(company)} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>}
      />
      <div className="space-y-4 rounded-lg border border-border bg-white p-6">
        <div>
          <label className="text-sm text-muted-foreground">Lead sources</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {company.leadSources.map((source) => (
              <span key={source} className="rounded-full bg-muted px-3 py-1 text-sm">{source}</span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Input value={newSource} onChange={(e) => setNewSource(e.target.value)} placeholder="Add source" />
            <Button variant="outline" onClick={addSource}>Add</Button>
          </div>
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Default assignee user ID</label>
          <Input
            className="mt-1"
            value={company.defaultLeadAssigneeId ?? ""}
            onChange={(e) => setCompany({ ...company, defaultLeadAssigneeId: e.target.value || null })}
            placeholder="Optional user ID"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="notifyLeadCreated"
            type="checkbox"
            checked={company.notifyLeadCreated ?? true}
            onChange={(e) => setCompany({ ...company, notifyLeadCreated: e.target.checked })}
          />
          <label htmlFor="notifyLeadCreated" className="text-sm">
            Email the company support/contact address when a new website lead arrives
            (not individual salesperson or staff inboxes)
          </label>
        </div>
      </div>
    </ContentArea>
  );
}
