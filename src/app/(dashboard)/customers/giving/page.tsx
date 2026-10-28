"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { HeartHandshake } from "lucide-react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
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
import { formatPhoneDisplay } from "@/lib/inbox/phone";

const STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST", "SPAM"];

type GivingLead = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  formDetails: string[];
  convertedCustomer: { id: string; name: string } | null;
  createdAt: string;
};

function programLabel(source: string | null) {
  return source === "share-the-cheer-partner" ? "Partner offer" : "Family nomination";
}

export default function GivingLeadsPage() {
  const [leads, setLeads] = useState<GivingLead[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ category: "giving" });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      fetch(`/api/leads?${params}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((data) => setLeads(data.leads ?? []))
        .catch((error) => {
          if (error instanceof Error && error.name !== "AbortError") {
            toast.error("Failed to load giving submissions");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [search, statusFilter]);

  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Customers", "Giving"]}
        title="Giving"
        subtitle="Share the Cheer nominations and partner offers. These submissions stay out of the sales pipeline and automated follow-ups."
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          placeholder="Search giving submissions"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-sm"
        />
        <select
          aria-label="Submission status"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="">All statuses</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : leads.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <HeartHandshake className="mx-auto mb-3 h-8 w-8" />
          <p>No Share the Cheer submissions found.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Program</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">
                    {lead.convertedCustomer ? (
                      <Link href={`/customers/${lead.convertedCustomer.id}`} className="text-primary hover:underline">
                        {lead.name}
                      </Link>
                    ) : lead.name}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{lead.phone ? formatPhoneDisplay(lead.phone) : "—"}</div>
                    <div className="text-xs text-muted-foreground">{lead.email ?? ""}</div>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{programLabel(lead.source)}</Badge></TableCell>
                  <TableCell><Badge variant="outline">{lead.status}</Badge></TableCell>
                  <TableCell>{format(new Date(lead.createdAt), "MMM d, yyyy")}</TableCell>
                  <TableCell className="max-w-md">
                    {lead.formDetails.length || lead.notes ? (
                      <details>
                        <summary className="cursor-pointer text-sm font-medium text-primary">View submission</summary>
                        <div className="mt-2 space-y-1 whitespace-pre-wrap text-sm text-muted-foreground">
                          {lead.formDetails.map((line, index) => (
                            <div key={`${lead.id}-${index}`}>{line || <br />}</div>
                          ))}
                          {!lead.formDetails.length && lead.notes ? <div>{lead.notes}</div> : null}
                        </div>
                      </details>
                    ) : "—"}
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

