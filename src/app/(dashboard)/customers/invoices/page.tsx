"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { CustomerNameWithBadge } from "@/components/customers/CustomerNameWithBadge";
import { DeleteInvoiceDialog } from "@/components/invoices/DeleteInvoiceDialog";
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
import { canAccessInvoices, canIssueRefunds } from "@/lib/invoices/permissions";

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
  visit?: { id: string; title: string } | null;
  maintenancePlanEnrollment?: { id: string; planName: string } | null;
};

export default function CustomerInvoicesPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const role = session?.user?.role ?? "TECH";
  const canView = canAccessInvoices(role);
  const canRefund = canIssueRefunds(role);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [refundInvoice, setRefundInvoice] = useState<InvoiceRow | null>(null);
  const [deleteInvoice, setDeleteInvoice] = useState<InvoiceRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (!canView) router.replace("/customers");
  }, [status, canView, router]);

  const load = useCallback(() => {
    if (!canView) return;
    setLoading(true);
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    fetch(`/api/invoices${params}`)
      .then((r) => r.json())
      .then((data) => setInvoices(data.invoices ?? []))
      .catch(() => toast.error("Failed to load invoices"))
      .finally(() => setLoading(false));
  }, [search, canView]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAction(id: string, action: "send" | "remind" | "copy" | "void") {
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
      toast.success(
        action === "send" ? "Invoice sent" : action === "remind" ? "Reminder sent" : "Invoice voided"
      );
      load();
    } finally {
      setActingId(null);
    }
  }

  async function confirmDelete(voidFirst: boolean) {
    if (!deleteInvoice) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/invoices/${deleteInvoice.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voidFirst }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to delete invoice");
        return;
      }
      toast.success(voidFirst ? "Invoice voided and deleted" : "Invoice deleted");
      setDeleteInvoice(null);
      load();
    } finally {
      setDeleting(false);
    }
  }

  if (!canView) {
    return (
      <ContentArea>
        <PageHeader breadcrumb={["Customers", "Invoices"]} title="Invoices" />
        <p className="text-sm text-muted-foreground">You do not have access to invoices.</p>
      </ContentArea>
    );
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
                    <div className="flex flex-wrap justify-end gap-1">
                      {invoice.balanceDue > 0 && invoice.status !== "VOID" ? (
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
                      {invoice.status !== "VOID" && invoice.status !== "REFUNDED" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={actingId === invoice.id}
                          onClick={() => handleAction(invoice.id, "void")}
                        >
                          Void
                        </Button>
                      ) : null}
                      {invoice.visit ? (
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/visits/${invoice.visit.id}`}>Visit</Link>
                        </Button>
                      ) : null}
                      {invoice.maintenancePlanEnrollment ? (
                        <Button variant="ghost" size="sm" asChild>
                          <Link
                            href={`/maintenance-plans/enrollments/${invoice.maintenancePlanEnrollment.id}`}
                          >
                            Plan
                          </Link>
                        </Button>
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
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteInvoice(invoice)}
                      >
                        Delete
                      </Button>
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
      {deleteInvoice ? (
        <DeleteInvoiceDialog
          open
          invoiceNumber={deleteInvoice.invoiceNumber}
          loading={deleting}
          onClose={() => !deleting && setDeleteInvoice(null)}
          onConfirm={(voidFirst) => void confirmDelete(voidFirst)}
        />
      ) : null}
    </ContentArea>
  );
}
