"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { useSession } from "next-auth/react";
import { CustomerNameWithBadge } from "@/components/customers/CustomerNameWithBadge";
import { IssueRefundDialog } from "@/components/invoices/IssueRefundDialog";
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
import { canIssueRefunds } from "@/lib/invoices/permissions";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  status: string;
  total: number;
  amountPaid: number;
  balanceDue: number;
  publicToken: string;
  createdAt: string;
  customer: { id: string; name: string; doNotService?: boolean };
};

export default function CustomerInvoicesPage() {
  const { data: session } = useSession();
  const canRefund = canIssueRefunds(session?.user?.role ?? "TECH");
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [refundInvoice, setRefundInvoice] = useState<InvoiceRow | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    fetch(`/api/invoices${params}`)
      .then((r) => r.json())
      .then((data) => setInvoices(data.invoices ?? []))
      .catch(() => toast.error("Failed to load invoices"))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAction(id: string, action: "send" | "remind" | "copy") {
    if (action === "copy") {
      const invoice = invoices.find((inv) => inv.id === id);
      if (!invoice) return;
      const payLink = `${window.location.origin}/pay/${invoice.publicToken}`;
      await navigator.clipboard.writeText(payLink);
      toast.success("Pay link copied");
      return;
    }

    setActingId(id);
    try {
      const res = await fetch(`/api/invoices/${id}/${action}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (data.payUrl) {
          await navigator.clipboard.writeText(data.payUrl);
          toast.message(data.error, { description: "Pay link copied to clipboard." });
        } else {
          toast.error(data.error ?? "Action failed");
        }
        return;
      }
      toast.success(action === "send" ? "Invoice sent" : "Reminder sent");
      load();
    } finally {
      setActingId(null);
    }
  }

  return (
    <ContentArea>
      <PageHeader breadcrumb={["Customers", "Invoices"]} title="Invoices" />
      <div className="mb-4">
        <Input
          placeholder="Search invoices"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invoices found.</p>
      ) : (
        <div className="rounded-lg border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                  <TableCell>
                    <CustomerNameWithBadge
                      name={invoice.customer.name}
                      doNotService={invoice.customer.doNotService}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{invoice.status}</Badge>
                  </TableCell>
                  <TableCell>{formatCurrency(invoice.total)}</TableCell>
                  <TableCell>{formatCurrency(invoice.balanceDue)}</TableCell>
                  <TableCell>{format(new Date(invoice.createdAt), "MMM d, yyyy")}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {invoice.balanceDue > 0 ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={actingId === invoice.id}
                            onClick={() => handleAction(invoice.id, "send")}
                          >
                            Send
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={actingId === invoice.id}
                            onClick={() => handleAction(invoice.id, "remind")}
                          >
                            Remind
                          </Button>
                        </>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAction(invoice.id, "copy")}
                      >
                        Copy link
                      </Button>
                      {canRefund && invoice.amountPaid > 0 && invoice.status !== "REFUNDED" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setRefundInvoice(invoice)}
                        >
                          Refund
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {refundInvoice ? (
        <IssueRefundDialog
          invoiceId={refundInvoice.id}
          invoiceNumber={refundInvoice.invoiceNumber}
          customerName={refundInvoice.customer.name}
          open
          onClose={() => setRefundInvoice(null)}
          onRefunded={() => load()}
        />
      ) : null}
    </ContentArea>
  );
}
