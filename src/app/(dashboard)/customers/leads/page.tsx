"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

const STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"];

export default function CustomerLeadsPage() {
  const [leads, setLeads] = useState<
    Array<{
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      source: string | null;
      status: string;
      assignedUser: { name: string } | null;
      convertedCustomer: { id: string; name: string } | null;
      createdAt: string;
    }>
  >([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newLead, setNewLead] = useState({ name: "", phone: "", email: "", source: "" });

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    fetch(`/api/leads?${params}`)
      .then((r) => r.json())
      .then((data) => setLeads(data.leads ?? []))
      .catch(() => toast.error("Failed to load leads"))
      .finally(() => setLoading(false));
  }, [search, statusFilter]);

  async function createLead() {
    if (!newLead.name.trim()) return;
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newLead),
    });
    if (!res.ok) {
      toast.error("Failed to create lead");
      return;
    }
    setNewLead({ name: "", phone: "", email: "", source: "" });
    setShowForm(false);
    setLoading(true);
    fetch("/api/leads")
      .then((r) => r.json())
      .then((data) => setLeads(data.leads ?? []))
      .finally(() => setLoading(false));
    toast.success("Lead created");
  }

  async function convertLead(id: string) {
    const res = await fetch(`/api/leads/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "convert" }),
    });
    if (!res.ok) {
      toast.error("Failed to convert lead");
      return;
    }
    const data = await res.json();
    toast.success(`Converted to customer ${data.customer.name}`);
    setLoading(true);
    fetch("/api/leads")
      .then((r) => r.json())
      .then((d) => setLeads(d.leads ?? []))
      .finally(() => setLoading(false));
  }

  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Customers", "Leads"]}
        title="Leads"
        actions={
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" />
            New lead
          </Button>
        }
      />

      {showForm && (
        <div className="mb-4 grid max-w-xl grid-cols-2 gap-3 rounded-lg border border-border bg-white p-4">
          <Input placeholder="Name" value={newLead.name} onChange={(e) => setNewLead({ ...newLead, name: e.target.value })} />
          <Input placeholder="Phone" value={newLead.phone} onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })} />
          <Input placeholder="Email" value={newLead.email} onChange={(e) => setNewLead({ ...newLead, email: e.target.value })} />
          <Input placeholder="Source" value={newLead.source} onChange={(e) => setNewLead({ ...newLead, source: e.target.value })} />
          <Button onClick={createLead} className="col-span-2 w-fit">Create lead</Button>
        </div>
      )}

      <div className="mb-4 flex gap-3">
        <Input placeholder="Search leads" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : leads.length === 0 ? (
        <p className="text-sm text-muted-foreground">No leads found.</p>
      ) : (
        <div className="rounded-lg border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">{lead.name}</TableCell>
                  <TableCell>
                    <div className="text-sm">{lead.phone ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{lead.email ?? ""}</div>
                  </TableCell>
                  <TableCell>{lead.source ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{lead.status}</Badge></TableCell>
                  <TableCell>{lead.assignedUser?.name ?? "—"}</TableCell>
                  <TableCell>{format(new Date(lead.createdAt), "MMM d, yyyy")}</TableCell>
                  <TableCell>
                    {lead.convertedCustomer ? (
                      <Link href={`/customers/${lead.convertedCustomer.id}`} className="text-sm text-primary hover:underline">
                        View customer
                      </Link>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => convertLead(lead.id)}>Convert</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </ContentArea>
  );
}
