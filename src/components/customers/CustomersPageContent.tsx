"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CustomerTable } from "@/components/customers/CustomerTable";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { CustomerDTO } from "@/lib/customers/types";

export default function CustomersPageContent() {
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    email: "",
    phone: "",
    companyName: "",
  });

  const load = useCallback(async (query?: string) => {
    const params = query ? `?search=${encodeURIComponent(query)}` : "";
    const res = await fetch(`/api/customers${params}`);
    if (!res.ok) throw new Error("Failed to load");
    const data = await res.json();
    setCustomers(data.customers ?? []);
  }, []);

  useEffect(() => {
    load()
      .catch(() => toast.error("Failed to load customers"))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => {
      load(search).catch(() => toast.error("Search failed"));
    }, 300);
    return () => clearTimeout(timer);
  }, [search, load]);

  async function createCustomer(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newCustomer),
    });
    if (!res.ok) {
      toast.error("Failed to create customer");
      return;
    }
    const customer = await res.json();
    window.location.href = `/customers/${customer.id}`;
  }

  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Customers", "All Customers"]}
        title="All Customers"
        subtitle={loading ? "Loading..." : `${customers.length} records`}
        actions={
          <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
            <Plus className="h-4 w-4" />
            Create customer
          </Button>
        }
      />

      {showCreate && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">New customer</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={createCustomer} className="grid gap-3 sm:grid-cols-2">
              <Input
                value={newCustomer.name}
                onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                placeholder="Name"
                required
              />
              <Input
                value={newCustomer.companyName}
                onChange={(e) => setNewCustomer({ ...newCustomer, companyName: e.target.value })}
                placeholder="Company (optional)"
              />
              <Input
                value={newCustomer.phone}
                onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                placeholder="Phone"
              />
              <Input
                value={newCustomer.email}
                onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                placeholder="Email"
                type="email"
              />
              <div className="sm:col-span-2 flex gap-2">
                <Button type="submit">Create</Button>
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="mb-4">
        <Input
          placeholder="Search customers"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading customers...</p>
      ) : (
        <CustomerTable data={customers} />
      )}
    </ContentArea>
  );
}
