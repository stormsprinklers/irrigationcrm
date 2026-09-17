"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import type { SortingState } from "@tanstack/react-table";
import { CustomerTable } from "@/components/customers/CustomerTable";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GitMerge, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { canFlagDoNotService, canManageCustomers } from "@/lib/customers/permissions";
import { CustomerNameWithBadge } from "@/components/customers/CustomerNameWithBadge";
import { CustomerImportDialog } from "@/components/customers/CustomerImportDialog";
import type { CustomerDTO, CustomerListFilters } from "@/lib/customers/types";
import { createDraftCustomer } from "@/lib/schedule/create-draft";

const emptyFilters: CustomerListFilters = {
  search: "",
  city: "",
  zip: "",
  leadSource: "",
  company: "",
  status: "ACTIVE",
};

type Props = {
  /** Paying customers vs never-paid contacts. */
  segment: "CUSTOMERS" | "CONTACTS";
};

function buildQuery(filters: CustomerListFilters, pageIndex: number, pageSize: number, sorting: SortingState) {
  const params = new URLSearchParams();
  if (filters.search?.trim()) params.set("search", filters.search.trim());
  if (filters.city?.trim()) params.set("city", filters.city.trim());
  if (filters.zip?.trim()) params.set("zip", filters.zip.trim());
  if (filters.leadSource?.trim()) params.set("leadSource", filters.leadSource.trim());
  if (filters.company?.trim()) params.set("company", filters.company.trim());
  if (filters.status && filters.status !== "ACTIVE") params.set("status", filters.status);
  if (filters.segment) params.set("segment", filters.segment);
  params.set("page", String(pageIndex + 1));
  params.set("pageSize", String(pageSize));
  if (sorting[0]?.id) {
    params.set("sortBy", sorting[0].id);
    params.set("sortDesc", String(sorting[0].desc));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export default function CustomersPageContent({ segment }: Props) {
  const isContacts = segment === "CONTACTS";
  const { data: session } = useSession();
  const userRole = session?.user?.role ?? "TECH";
  const canManage = canManageCustomers(userRole);
  const canFlagDns = canFlagDoNotService(userRole);

  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [sorting, setSorting] = useState<SortingState>([]);
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
    segment,
  }));
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        filters.search?.trim() ||
          filters.city?.trim() ||
          filters.zip?.trim() ||
          filters.leadSource?.trim() ||
          filters.company?.trim()
      ),
    [filters]
  );

  const load = useCallback(async (queryFilters: CustomerListFilters, signal?: AbortSignal) => {
    const res = await fetch(`/api/customers${buildQuery(queryFilters, pageIndex, pageSize, sorting)}`, { signal });
    if (!res.ok) throw new Error("Failed to load");
    const data = await res.json();
    if (!signal?.aborted) {
      setCustomers(data.customers ?? []);
      setTotal(data.total ?? 0);
      if (pageIndex > 0 && data.total > 0 && !data.customers?.length) {
        setPageIndex(Math.max(0, Math.ceil(data.total / pageSize) - 1));
      }
    }
  }, [pageIndex, pageSize, sorting]);

  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      status: listTab === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
      segment,
    }));
    setSelectedIds([]);
    setPageIndex(0);
  }, [listTab, segment]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      load(filters, controller.signal)
        .catch(() => {
          if (!controller.signal.aborted) toast.error(isContacts ? "Failed to load contacts" : "Failed to load customers");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [filters, load, isContacts]);

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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Bulk action failed");
        return;
      }
      if (action === "delete") {
        const failed = Array.isArray(data.failed) ? data.failed as Array<{ id: string; reason: string }> : [];
        if (failed.length) {
          toast.error(`${data.deleted ?? 0} deleted; ${failed.length} could not be deleted. ${failed[0]?.reason ?? ""}`);
          setSelectedIds(failed.map((item) => item.id));
        } else {
          toast.success(`${data.deleted ?? selectedIds.length} deleted`);
          setSelectedIds([]);
        }
      } else {
        toast.success("Updated successfully");
        setSelectedIds([]);
      }
      setMergeOpen(false);
      setDeleteOpen(false);
      await load(filters);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk action failed");
    } finally {
      setBulkLoading(false);
    }
  }

  function updateFilter<K extends keyof CustomerListFilters>(key: K, value: CustomerListFilters[K]) {
    setPageIndex(0);
    setSelectedIds([]);
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  async function createCustomer() {
    if (creating) return;
    setCreating(true);
    try {
      const customer = await createDraftCustomer();
      window.location.href = `/customers/${customer.id}?edit=1`;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : isContacts ? "Failed to create contact" : "Failed to create customer");
      setCreating(false);
    }
  }

  return (
    <ContentArea>
      <PageHeader
        breadcrumb={["Customers", isContacts ? "Contacts" : "All Customers"]}
        title={isContacts ? "Contacts" : "Customers"}
        subtitle={
          loading
            ? "Loading..."
            : isContacts
              ? `${total} people with no lifetime value — never billed for work`
              : `${total} customers with paid work`
        }
        actions={<div className="flex gap-2">
          {canManage ? <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>Import customers</Button> : null}
          <Button size="sm" onClick={() => void createCustomer()} disabled={creating}>
            <Plus className="h-4 w-4" />
            {creating ? "Creating…" : isContacts ? "Create contact" : "Create customer"}
          </Button>
        </div>}
      />

      <CustomerImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={() => void load(filters)} />

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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { setPageIndex(0); setFilters({ ...emptyFilters, segment }); }}
          >
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
                    isContact={customer.isContact}
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
        <p className="text-sm text-muted-foreground">
          {isContacts ? "Loading contacts..." : "Loading customers..."}
        </p>
      ) : (
        <CustomerTable
          data={customers}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          nameColumnLabel={isContacts ? "Contact name" : "Customer name"}
          pageIndex={pageIndex}
          pageSize={pageSize}
          total={total}
          onPageChange={(nextPage) => { setSelectedIds([]); setPageIndex(nextPage); }}
          onPageSizeChange={(nextSize) => { setSelectedIds([]); setPageIndex(0); setPageSize(nextSize); }}
          sorting={sorting}
          onSortingChange={(nextSorting) => { setSelectedIds([]); setPageIndex(0); setSorting(nextSorting); }}
        />
      )}
    </ContentArea>
  );
}
