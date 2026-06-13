"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CustomerDTO, CustomerPropertyDTO } from "@/lib/customers/types";

type Props = { customerId: string };

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function CustomerProfile({ customerId }: Props) {
  const [customer, setCustomer] = useState<CustomerDTO | null>(null);
  const [properties, setProperties] = useState<CustomerPropertyDTO[]>([]);
  const [visits, setVisits] = useState<
    Array<{ id: string; title: string; status: string; startAt: string; total?: number }>
  >([]);
  const [estimates, setEstimates] = useState<
    Array<{ id: string; status: string; total: number; createdAt: string }>
  >([]);
  const [invoices, setInvoices] = useState<
    Array<{ id: string; invoiceNumber: string; status: string; total: number; createdAt: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newProperty, setNewProperty] = useState({ name: "", address: "", city: "", state: "", zip: "" });

  const load = useCallback(async () => {
    const [customerRes, propertiesRes, estimatesRes, invoicesRes] = await Promise.all([
      fetch(`/api/customers/${customerId}`),
      fetch(`/api/customers/${customerId}/properties`),
      fetch(`/api/estimates?customerId=${customerId}`),
      fetch(`/api/invoices?customerId=${customerId}`),
    ]);

    if (customerRes.ok) setCustomer(await customerRes.json());
    if (propertiesRes.ok) setProperties(await propertiesRes.json());
    if (estimatesRes.ok) {
      const data = await estimatesRes.json();
      setEstimates(data.estimates ?? []);
    }
    if (invoicesRes.ok) {
      const data = await invoicesRes.json();
      setInvoices(data.invoices ?? []);
    }

    const now = new Date();
    const start = new Date(now.getFullYear() - 1, 0, 1).toISOString();
    const end = new Date(now.getFullYear() + 1, 11, 31).toISOString();
    const scheduleRes = await fetch(`/api/schedule/jobs?start=${start}&end=${end}`);
    if (scheduleRes.ok) {
      const jobs = await scheduleRes.json();
      setVisits(jobs.filter((j: { customer?: { id: string } }) => j.customer?.id === customerId));
    }
  }, [customerId]);

  useEffect(() => {
    load()
      .catch(() => toast.error("Failed to load customer"))
      .finally(() => setLoading(false));
  }, [load]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!customer) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customer),
      });
      if (!res.ok) {
        toast.error("Failed to save customer");
        return;
      }
      setCustomer(await res.json());
      toast.success("Customer updated");
    } finally {
      setSaving(false);
    }
  }

  async function addProperty(e: React.FormEvent) {
    e.preventDefault();
    if (!newProperty.name.trim()) return;
    const res = await fetch(`/api/customers/${customerId}/properties`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newProperty),
    });
    if (!res.ok) {
      toast.error("Failed to add property");
      return;
    }
    setNewProperty({ name: "", address: "", city: "", state: "", zip: "" });
    const propsRes = await fetch(`/api/customers/${customerId}/properties`);
    if (propsRes.ok) setProperties(await propsRes.json());
  }

  async function deleteProperty(propertyId: string) {
    const res = await fetch(`/api/customers/${customerId}/properties/${propertyId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Failed to delete property");
      return;
    }
    setProperties((prev) => prev.filter((p) => p.id !== propertyId));
  }

  async function createEstimate() {
    const res = await fetch("/api/estimates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId }),
    });
    if (!res.ok) {
      toast.error("Failed to create estimate");
      return;
    }
    const estimate = await res.json();
    window.location.href = `/estimates/${estimate.id}`;
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading customer...</p>;

  if (!customer) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Customer not found.</p>
        <Button variant="outline" asChild>
          <Link href="/customers">
            <ArrowLeft className="h-4 w-4" />
            Back to customers
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" asChild>
          <Link href="/customers">
            <ArrowLeft className="h-4 w-4" />
            Customers
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">{customer.name}</h1>
        {customer.companyName && <p className="text-muted-foreground">{customer.companyName}</p>}
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="properties">Properties</TabsTrigger>
          <TabsTrigger value="visits">Visits</TabsTrigger>
          <TabsTrigger value="estimates">Estimates</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contact information</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Name</label>
                  <Input
                    value={customer.name}
                    onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Company</label>
                  <Input
                    value={customer.companyName ?? ""}
                    onChange={(e) => setCustomer({ ...customer, companyName: e.target.value || null })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Phone</label>
                  <Input
                    value={customer.phone ?? ""}
                    onChange={(e) => setCustomer({ ...customer, phone: e.target.value || null })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Email</label>
                  <Input
                    value={customer.email ?? ""}
                    onChange={(e) => setCustomer({ ...customer, email: e.target.value || null })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium">Address</label>
                  <Input
                    value={customer.address ?? ""}
                    onChange={(e) => setCustomer({ ...customer, address: e.target.value || null })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">City</label>
                  <Input
                    value={customer.city ?? ""}
                    onChange={(e) => setCustomer({ ...customer, city: e.target.value || null })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">State</label>
                  <Input
                    value={customer.state ?? ""}
                    onChange={(e) => setCustomer({ ...customer, state: e.target.value || null })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">ZIP</label>
                  <Input
                    value={customer.zip ?? ""}
                    onChange={(e) => setCustomer({ ...customer, zip: e.target.value || null })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Lead source</label>
                  <Input
                    value={customer.leadSource ?? ""}
                    onChange={(e) => setCustomer({ ...customer, leadSource: e.target.value || null })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving..." : "Save changes"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="properties" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Properties</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {properties.map((property) => (
                <div key={property.id} className="flex items-start justify-between rounded-md border p-3">
                  <div>
                    <div className="font-medium">
                      {property.name}
                      {property.isPrimary && (
                        <Badge variant="outline" className="ml-2">
                          Primary
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {[property.address, property.city, property.state, property.zip]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => deleteProperty(property.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              <form onSubmit={addProperty} className="grid gap-2 border-t pt-4 sm:grid-cols-2">
                <Input
                  value={newProperty.name}
                  onChange={(e) => setNewProperty({ ...newProperty, name: e.target.value })}
                  placeholder="Property name"
                  required
                />
                <Input
                  value={newProperty.address}
                  onChange={(e) => setNewProperty({ ...newProperty, address: e.target.value })}
                  placeholder="Address"
                />
                <Input
                  value={newProperty.city}
                  onChange={(e) => setNewProperty({ ...newProperty, city: e.target.value })}
                  placeholder="City"
                />
                <Input
                  value={newProperty.state}
                  onChange={(e) => setNewProperty({ ...newProperty, state: e.target.value })}
                  placeholder="State"
                />
                <Input
                  value={newProperty.zip}
                  onChange={(e) => setNewProperty({ ...newProperty, zip: e.target.value })}
                  placeholder="ZIP"
                />
                <Button type="submit">
                  <Plus className="h-4 w-4" />
                  Add property
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="visits">
          <Card>
            <CardContent className="pt-6">
              {visits.length === 0 ? (
                <p className="text-sm text-muted-foreground">No visits found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visits.map((visit) => (
                      <TableRow key={visit.id}>
                        <TableCell>
                          <Link href={`/visits/${visit.id}`} className="font-medium text-primary hover:underline">
                            {visit.title}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{visit.status}</Badge>
                        </TableCell>
                        <TableCell>{format(new Date(visit.startAt), "MMM d, yyyy")}</TableCell>
                        <TableCell>
                          {visit.total != null ? formatCurrency(visit.total) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="estimates" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={createEstimate}>
              <Plus className="h-4 w-4" />
              Create estimate
            </Button>
          </div>
          <Card>
            <CardContent className="pt-6">
              {estimates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No estimates yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {estimates.map((estimate) => (
                      <TableRow key={estimate.id}>
                        <TableCell>
                          <Link href={`/estimates/${estimate.id}`} className="text-primary hover:underline">
                            <Badge variant="outline">{estimate.status}</Badge>
                          </Link>
                        </TableCell>
                        <TableCell>{formatCurrency(estimate.total)}</TableCell>
                        <TableCell>{format(new Date(estimate.createdAt), "MMM d, yyyy")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <Card>
            <CardContent className="pt-6">
              {invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No invoices yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{invoice.status}</Badge>
                        </TableCell>
                        <TableCell>{formatCurrency(invoice.total)}</TableCell>
                        <TableCell>{format(new Date(invoice.createdAt), "MMM d, yyyy")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
