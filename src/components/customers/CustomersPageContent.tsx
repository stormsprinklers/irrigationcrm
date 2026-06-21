"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { CustomerTable } from "@/components/customers/CustomerTable";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GitMerge, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { canFlagDoNotService, canManageCustomers } from "@/lib/customers/permissions";
import { CustomerNameWithBadge } from "@/components/customers/CustomerNameWithBadge";
import type { CustomerDTO, CustomerListFilters } from "@/lib/customers/types";

const emptyFilters: CustomerListFilters = {
  search: "",
  city: "",
  zip: "",
  leadSource: "",
  company: "",
  status: "ACTIVE",
};

function buildQuery(filters: CustomerListFilters) {
  const params = new URLSearchParams();
  if (filters.search?.trim()) params.set("search", filters.search.trim());
  if (filters.city?.trim()) params.set("city", filters.city.trim());
  if (filters.zip?.trim()) params.set("zip", filters.zip.trim());
  if (filters.leadSource?.trim()) params.set("leadSource", filters.leadSource.trim());
  if (filters.company?.trim()) params.set("company", filters.company.trim());
  if (filters.status && filters.status !== "ACTIVE") params.set("status", filters.status);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export default function CustomersPageContent() {
  const { data: session } = useSession();
  const userRole = session?.user?.role ?? "TECH";
  const canManage = canManageCustomers(userRole);
  const canFlagDns = canFlagDoNotService(userRole);

  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [listTab, setListTab] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [filters, setFilters] = useState<CustomerListFilters>(() => ({
    search: searchParams.get("search") ?? "",
    city: searchParams.get("city") ?? "",
    zip: searchParams.get("zip") ?? "",
    leadSource: searchParams.get("leadSource") ?? "",
    company: searchParams.get("company") ?? "",
    status: "ACTIVE",
  }));
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    email: "",
    phone: "",
    companyName: "",
  });

  const hasActiveFilters = useMemo(
    () => Object.values(filters).some((value) => value?.trim()),
    [filters]
  );

  const load = useCallback(async (queryFilters: CustomerListFilters) => {
    const res = await fetch(`/api/customers${buildQuery(queryFilters)}`);
    if (!res.ok) throw new Error("Failed to load");
    const data = await res.json();
    setCustomers(data.customers ?? []);
  }, []);

  useEffect(() => {
    setFilters((prev) => ({ ...prev, status: listTab === "ARCHIVED" ? "ARCHIVED" : "ACTIVE" }));
    setSelectedIds([]);
  }, [listTab]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      load(filters)
        .catch(() => toast.error("Failed to load customers"))
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filters, load]);

  const selectedCustomers = useMemo(
    () => customers.filter((c) => selectedIds.includes(c.id)),
    [customers, selectedIds]
  );

  async function runBulkAction(
    action: string,
    extra?: Record<string, unknown>
  ) {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/customers/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, customerIds: selectedIds, ...extra }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Bulk action failed");
        return;
      }
      toast.success("Updated successfully");
      setSelectedIds([]);
      setMergeOpen(false);
      setDeleteOpen(false);
      await load(filters);
    } finally {
      setBulkLoading(false);
    }
  }

  function updateFilter<K extends keyof CustomerListFilters>(key: K, value: CustomerListFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

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

      <div className="mb-4 space-y-3">
        <Input
          placeholder="Search name, email, phone..."
          value={filters.search ?? ""}
          onChange={(e) => updateFilter("search", e.target.value)}
          className="max-w-md"
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="City"
            value={filters.city ?? ""}
            onChange={(e) => updateFilter("city", e.target.value)}
          />
          <Input
            placeholder="ZIP code"
            value={filters.zip ?? ""}
            onChange={(e) => updateFilter("zip", e.target.value)}
          />
          <Input
            placeholder="Lead source"
            value={filters.leadSource ?? ""}
            onChange={(e) => updateFilter("leadSource", e.target.value)}
          />
          <Input
            placeholder="Company"
            value={filters.company ?? ""}
            onChange={(e) => updateFilter("company", e.target.value)}
          />
        </div>
        {hasActiveFilters && (
          <Button type="button" variant="outline" size="sm" onClick={() => setFilters(emptyFilters)}>
            Clear filters
          </Button>
        )}
      </div>

      <Tabs value={listTab} onValueChange={(v) => setListTab(v as "ACTIVE" | "ARCHIVED")} className="mb-4">
        <TabsList>
          <TabsTrigger value="ACTIVE">Active</TabsTrigger>
          <TabsTrigger value="ARCHIVED">Archived</TabsTrigger>
        </TabsList>
      </Tabs>

      {selectedIds.length > 0 && (canManage || canFlagDns) && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
          <span className="text-sm font-medium">{selectedIds.length} selected</span>
          {canManage && listTab === "ACTIVE" && (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={bulkLoading}
                onClick={() => {
                  if (selectedIds.length < 2) {
                    toast.error("Select at least two customers to merge");
                    return;
                  }
                  setMergeTargetId(selectedIds[0] ?? "");
                  setMergeOpen(true);
                }}
              >
                <GitMerge className="h-4 w-4" />
                Merge
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={bulkLoading}
                onClick={() => runBulkAction("archive")}
              >
                Archive
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={bulkLoading}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </>
          )}
          {canManage && listTab === "ARCHIVED" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={bulkLoading}
              onClick={() => runBulkAction("restore")}
            >
              Restore
            </Button>
          )}
          {canFlagDns && listTab === "ACTIVE" && (
            <>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={bulkLoading}
                onClick={() => runBulkAction("setDoNotService")}
              >
                Mark do not service
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={bulkLoading}
                onClick={() => runBulkAction("clearDoNotService")}
              >
                Clear do not service
              </Button>
            </>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
            Clear selection
          </Button>
        </div>
      )}

      {mergeOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => setMergeOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
            <h2 className="text-lg font-semibold">Merge selected customers</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Choose the customer record to keep. All others will be merged into it and removed.
            </p>
            <div className="mt-4 max-h-48 space-y-1 overflow-y-auto rounded-md border">
              {selectedCustomers.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-muted ${
                    mergeTargetId === customer.id ? "bg-muted font-medium" : ""
                  }`}
                  onClick={() => setMergeTargetId(customer.id)}
                >
                  <CustomerNameWithBadge
                    name={customer.name}
                    doNotService={customer.doNotService}
                  />
                  {customer.email ? ` · ${customer.email}` : ""}
                </button>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                disabled={!mergeTargetId || bulkLoading}
                onClick={() => runBulkAction("merge", { targetCustomerId: mergeTargetId })}
              >
                {bulkLoading ? "Merging..." : "Merge customers"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setMergeOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => setDeleteOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
            <h2 className="text-lg font-semibold">Delete customers?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to delete {selectedIds.length} customer
              {selectedIds.length === 1 ? "" : "s"}? This cannot be undone.
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="destructive"
                disabled={bulkLoading}
                onClick={() => runBulkAction("delete")}
              >
                {bulkLoading ? "Deleting..." : "Yes, delete"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading customers...</p>
      ) : (
        <CustomerTable
          data={customers}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
        />
      )}
    </ContentArea>
  );
}
