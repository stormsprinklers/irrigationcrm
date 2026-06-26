"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { ArrowLeft, GitMerge, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { CreateCustomerVisitModal } from "@/components/customers/CreateCustomerVisitModal";
import {
  CustomerEmailAction,
  CustomerPhoneActions,
} from "@/components/customers/CustomerContactActions";
import { CustomerNameWithBadge } from "@/components/customers/CustomerNameWithBadge";
import { CustomerNotesAttachmentsTab } from "@/components/customers/CustomerNotesAttachmentsTab";
import { CustomerPaymentMethodsSection } from "@/components/customers/CustomerPaymentMethodsSection";
import { CustomerPropertyMap } from "@/components/customers/CustomerPropertyMap";
import { CustomerSummaryCard } from "@/components/customers/CustomerSummaryCard";
import { CustomerTagsSection } from "@/components/customers/CustomerTagsSection";
import { AddressFields } from "@/components/customers/AddressFields";
import { canFlagDoNotService, canManageCustomers } from "@/lib/customers/permissions";
import { buildGoogleMapsUrl, formatCustomerAddress, pickBestAddressForMap } from "@/lib/customers/maps";
import { IssueRefundDialog } from "@/components/invoices/IssueRefundDialog";
import { canIssueRefunds } from "@/lib/invoices/permissions";
import { EnrollPlanModal } from "@/components/maintenance-plans/EnrollPlanModal";
import { RachioPropertyPanel } from "@/components/rachio/RachioPropertyPanel";
import { PropertyIrrigationEditor } from "@/components/customers/PropertyIrrigationEditor";
import { PropertyIrrigationWizard } from "@/components/customers/PropertyIrrigationWizard";
import { PropertyIrrigationSummary } from "@/components/customers/PropertyIrrigationSummary";
import { BILLING_FREQUENCY_LABELS, formatCurrency } from "@/lib/maintenance-plans/format";
import type { EnrollmentDTO } from "@/lib/maintenance-plans/types";
import type { CustomerDTO, CustomerPhoneDTO, CustomerPropertyDTO } from "@/lib/customers/types";

type Props = { customerId: string };

function ProfileDetail({
  label,
  value,
  actions,
}: {
  label: string;
  value: string | null;
  actions?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center gap-1">
        <p className="text-sm">{value || "—"}</p>
        {actions}
      </div>
    </div>
  );
}

function ConfirmModal({
  title,
  message,
  confirmLabel,
  open,
  onClose,
  onConfirm,
  destructive,
  loading,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  destructive?: boolean;
  loading?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Please wait..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CustomerProfile({ customerId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const validTabs = new Set([
    "profile",
    "properties",
    "visits",
    "estimates",
    "invoices",
    "maintenance",
  ]);
  const tabFromUrl = searchParams.get("tab");
  const propertyIdFromUrl = searchParams.get("propertyId");
  const initialTab =
    tabFromUrl === "notes"
      ? "profile"
      : tabFromUrl && validTabs.has(tabFromUrl)
        ? tabFromUrl
        : propertyIdFromUrl
          ? "properties"
          : "profile";
  const [activeTab, setActiveTab] = useState(initialTab);
  const userRole = session?.user?.role ?? "TECH";
  const canManage = canManageCustomers(userRole);
  const canFlagDns = canFlagDoNotService(userRole);
  const canRefund = canIssueRefunds(userRole);
  const canManagePayments =
    userRole === "CSR" || userRole === "MANAGER" || userRole === "ADMIN";
  const [customer, setCustomer] = useState<CustomerDTO | null>(null);
  const [properties, setProperties] = useState<CustomerPropertyDTO[]>([]);
  const [phones, setPhones] = useState<CustomerPhoneDTO[]>([]);
  const [visits, setVisits] = useState<
    Array<{ id: string; title: string; status: string; startAt: string; total?: number }>
  >([]);
  const [estimates, setEstimates] = useState<
    Array<{ id: string; status: string; total: number; createdAt: string }>
  >([]);
  const [invoices, setInvoices] = useState<
    Array<{
      id: string;
      invoiceNumber: string;
      status: string;
      total: number;
      amountPaid: number;
      createdAt: string;
    }>
  >([]);
  const [enrollments, setEnrollments] = useState<EnrollmentDTO[]>([]);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeCandidates, setMergeCandidates] = useState<CustomerDTO[]>([]);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [refundInvoiceId, setRefundInvoiceId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newProperty, setNewProperty] = useState({
    name: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    latitude: null as number | null,
    longitude: null as number | null,
  });
  const [newPhone, setNewPhone] = useState({ phone: "", note: "" });
  const [editMode, setEditMode] = useState(false);
  const [draftCustomer, setDraftCustomer] = useState<CustomerDTO | null>(null);

  useEffect(() => {
    if (tabFromUrl && validTabs.has(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    } else if (propertyIdFromUrl) {
      setActiveTab("properties");
    }
  }, [tabFromUrl, propertyIdFromUrl]);

  useEffect(() => {
    if (activeTab !== "properties" || !propertyIdFromUrl || loading) return;
    const el = document.getElementById(`property-${propertyIdFromUrl}`);
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [activeTab, propertyIdFromUrl, loading, properties.length]);

  const load = useCallback(async () => {
    const [customerRes, propertiesRes, phonesRes, estimatesRes, invoicesRes, enrollmentsRes] =
      await Promise.all([
      fetch(`/api/customers/${customerId}`),
      fetch(`/api/customers/${customerId}/properties`),
      fetch(`/api/customers/${customerId}/phones`),
      fetch(`/api/estimates?customerId=${customerId}`),
      fetch(`/api/invoices?customerId=${customerId}`),
      fetch(`/api/maintenance-plans/enrollments?customerId=${customerId}`),
    ]);

    if (customerRes.ok) setCustomer(await customerRes.json());
    if (propertiesRes.ok) {
      const data = await propertiesRes.json();
      setProperties(Array.isArray(data) ? data : []);
    }
    if (phonesRes.ok) {
      const data = await phonesRes.json();
      setPhones(Array.isArray(data) ? data : []);
    }
    if (estimatesRes.ok) {
      const data = await estimatesRes.json();
      setEstimates(data.estimates ?? []);
    }
    if (invoicesRes.ok) {
      const data = await invoicesRes.json();
      setInvoices(data.invoices ?? []);
    }
    if (enrollmentsRes.ok) {
      const data = await enrollmentsRes.json();
      setEnrollments(data.enrollments ?? []);
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
    const payload = draftCustomer ?? customer;
    if (!payload) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toast.error("Failed to save customer");
        return;
      }
      const updated = await res.json();
      setCustomer(updated);
      setDraftCustomer(null);
      setEditMode(false);
      toast.success("Customer updated");
    } finally {
      setSaving(false);
    }
  }

  function startEditing() {
    if (!customer) return;
    setDraftCustomer({ ...customer });
    setEditMode(true);
  }

  function cancelEditing() {
    setDraftCustomer(null);
    setEditMode(false);
  }

  const profileCustomer = editMode ? draftCustomer : customer;
  const formattedAddress = customer
    ? formatCustomerAddress({
        address: customer.address,
        city: customer.city,
        state: customer.state,
        zip: customer.zip,
      })
    : null;
  const mapsUrl = customer
    ? buildGoogleMapsUrl({
        address: customer.address,
        city: customer.city,
        state: customer.state,
        zip: customer.zip,
      })
    : null;
  const primaryProperty = properties.find((p) => p.isPrimary) ?? properties[0];
  const mapLocation = pickBestAddressForMap(customer, properties);

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
    setNewProperty({
      name: "",
      address: "",
      city: "",
      state: "",
      zip: "",
      latitude: null,
      longitude: null,
    });
    const propsRes = await fetch(`/api/customers/${customerId}/properties`);
    if (propsRes.ok) {
      const data = await propsRes.json();
      setProperties(Array.isArray(data) ? data : []);
    }
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

  async function sendPortalLink() {
    if (!customer?.email) {
      toast.error("Customer must have an email address");
      return;
    }
    const res = await fetch(`/api/customers/${customerId}/portal-link`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Failed to send portal link");
      return;
    }
    toast.success("Portal sign-in link sent");
  }

  async function openEnrollModal() {
    if (!customer) return;

    if (properties.length === 0) {
      const hasAddress = Boolean(customer.address || customer.city || customer.zip);
      if (!hasAddress) {
        toast.error("Add a property on the Properties tab before enrolling in a plan.");
        return;
      }

      const res = await fetch(`/api/customers/${customerId}/properties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Primary",
          address: customer.address,
          city: customer.city,
          state: customer.state,
          zip: customer.zip,
          isPrimary: true,
        }),
      });

      if (!res.ok) {
        toast.error("Add a property before enrolling in a plan.");
        return;
      }

      const property = await res.json();
      setProperties([property]);
    }

    setEnrollOpen(true);
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

  async function addPhone(e: React.FormEvent) {
    e.preventDefault();
    if (!newPhone.phone.trim()) return;
    const res = await fetch(`/api/customers/${customerId}/phones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newPhone),
    });
    if (!res.ok) {
      toast.error("Failed to add phone number");
      return;
    }
    setNewPhone({ phone: "", note: "" });
    const phonesRes = await fetch(`/api/customers/${customerId}/phones`);
    if (phonesRes.ok) setPhones(await phonesRes.json());
  }

  async function deletePhone(phoneId: string) {
    const res = await fetch(`/api/customers/${customerId}/phones/${phoneId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to remove phone number");
      return;
    }
    setPhones((prev) => prev.filter((p) => p.id !== phoneId));
  }

  async function deleteCustomer() {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/customers/${customerId}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to delete customer");
        return;
      }
      toast.success("Customer deleted");
      router.push("/customers");
    } finally {
      setActionLoading(false);
      setDeleteOpen(false);
    }
  }

  async function searchMergeCandidates(query: string) {
    setMergeSearch(query);
    if (!query.trim()) {
      setMergeCandidates([]);
      return;
    }
    const res = await fetch(`/api/customers?search=${encodeURIComponent(query.trim())}`);
    if (!res.ok) return;
    const data = await res.json();
    setMergeCandidates((data.customers ?? []).filter((c: CustomerDTO) => c.id !== customerId));
  }

  async function mergeCustomer() {
    if (!mergeTargetId) {
      toast.error("Select a customer to merge into");
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCustomerId: mergeTargetId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to merge customers");
        return;
      }
      toast.success("Customers merged");
      setMergeOpen(false);
      router.push(`/customers/${mergeTargetId}`);
      router.refresh();
    } finally {
      setActionLoading(false);
    }
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-2" asChild>
            <Link href="/customers">
              <ArrowLeft className="h-4 w-4" />
              Customers
            </Link>
          </Button>
          <CustomerNameWithBadge
            name={customer.name}
            doNotService={customer.doNotService}
            className="text-2xl font-semibold"
            nameClassName="text-2xl font-semibold"
          />
          {customer.status === "ARCHIVED" && (
            <Badge variant="outline" className="mt-2">
              Archived
            </Badge>
          )}
          {customer.companyName && <p className="text-muted-foreground">{customer.companyName}</p>}
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void sendPortalLink()}>
              Send portal link
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setMergeOpen(true)}>
              <GitMerge className="h-4 w-4" />
              Merge
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        )}
      </div>

      {customer.doNotService && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-destructive">
          Do not service — appointments cannot be booked for this customer
        </div>
      )}

      <CustomerSummaryCard customerId={customerId} />
      <CustomerPropertyMap
        title={primaryProperty ? `${primaryProperty.name} location` : "Property location"}
        location={mapLocation}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="properties">Properties</TabsTrigger>
          <TabsTrigger value="visits">Visits</TabsTrigger>
          <TabsTrigger value="estimates">Estimates</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance Plans</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Contact information</CardTitle>
              {!editMode ? (
                <Button type="button" variant="ghost" size="icon" aria-label="Edit profile" onClick={startEditing}>
                  <Pencil className="h-4 w-4" />
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              {!editMode && customer ? (
                <dl className="grid gap-5 sm:grid-cols-2">
                  <ProfileDetail label="Name" value={customer.name} />
                  <ProfileDetail label="Company" value={customer.companyName} />
                  <ProfileDetail
                    label="Phone"
                    value={customer.phone}
                    actions={
                      <CustomerPhoneActions
                        customerId={customer.id}
                        name={customer.name}
                        phone={customer.phone}
                      />
                    }
                  />
                  <ProfileDetail
                    label="Email"
                    value={customer.email}
                    actions={
                      <CustomerEmailAction
                        customerId={customer.id}
                        name={customer.name}
                        email={customer.email}
                      />
                    }
                  />
                  <div className="sm:col-span-2">
                    <ProfileDetail
                      label="Address"
                      value={formattedAddress}
                      actions={
                        mapsUrl ? (
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-primary" asChild>
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label="Open address in Google Maps"
                            >
                              <MapPin className="h-4 w-4" />
                            </a>
                          </Button>
                        ) : null
                      }
                    />
                  </div>
                  <ProfileDetail label="Lead source" value={customer.leadSource} />
                  {customer.doNotService ? (
                    <div className="sm:col-span-2">
                      <Badge variant="destructive">Do not service</Badge>
                    </div>
                  ) : null}
                </dl>
              ) : profileCustomer ? (
                <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Name</label>
                    <Input
                      value={profileCustomer.name}
                      onChange={(e) =>
                        setDraftCustomer({ ...profileCustomer, name: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Company</label>
                    <Input
                      value={profileCustomer.companyName ?? ""}
                      onChange={(e) =>
                        setDraftCustomer({
                          ...profileCustomer,
                          companyName: e.target.value || null,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Phone</label>
                    <Input
                      value={profileCustomer.phone ?? ""}
                      onChange={(e) =>
                        setDraftCustomer({
                          ...profileCustomer,
                          phone: e.target.value || null,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Email</label>
                    <Input
                      value={profileCustomer.email ?? ""}
                      onChange={(e) =>
                        setDraftCustomer({
                          ...profileCustomer,
                          email: e.target.value || null,
                        })
                      }
                    />
                  </div>
                  <AddressFields
                    value={{
                      address: profileCustomer.address ?? "",
                      city: profileCustomer.city ?? "",
                      state: profileCustomer.state ?? "",
                      zip: profileCustomer.zip ?? "",
                    }}
                    onChange={(fields) =>
                      setDraftCustomer({
                        ...profileCustomer,
                        address: fields.address || null,
                        city: fields.city || null,
                        state: fields.state || null,
                        zip: fields.zip || null,
                      })
                    }
                  />
                  <div>
                    <label className="mb-1 block text-sm font-medium">Lead source</label>
                    <Input
                      value={profileCustomer.leadSource ?? ""}
                      onChange={(e) =>
                        setDraftCustomer({
                          ...profileCustomer,
                          leadSource: e.target.value || null,
                        })
                      }
                    />
                  </div>
                  {canFlagDns && (
                    <div className="sm:col-span-2">
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={profileCustomer.doNotService}
                          onCheckedChange={(checked) =>
                            setDraftCustomer({
                              ...profileCustomer,
                              doNotService: Boolean(checked),
                            })
                          }
                        />
                        Mark as DO NOT SERVICE (blocks all appointment booking)
                      </label>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    <Button type="submit" disabled={saving}>
                      {saving ? "Saving..." : "Save changes"}
                    </Button>
                    <Button type="button" variant="outline" onClick={cancelEditing} disabled={saving}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : null}

              <div className="mt-8 border-t pt-6">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Alternate phone numbers</h3>
                </div>
                {phones.length === 0 ? (
                  <p className="mb-4 text-sm text-muted-foreground">No alternate numbers.</p>
                ) : (
                  <div className="mb-4 space-y-2">
                    {phones.map((phone) => (
                      <div
                        key={phone.id}
                        className="flex items-start justify-between rounded-md border p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <p className="font-medium">{phone.phone}</p>
                            {!editMode && customer ? (
                              <CustomerPhoneActions
                                customerId={customer.id}
                                name={customer.name}
                                phone={phone.phone}
                              />
                            ) : null}
                          </div>
                          {phone.note && (
                            <p className="text-sm text-muted-foreground">{phone.note}</p>
                          )}
                        </div>
                        {editMode ? (
                          <Button variant="ghost" size="icon" onClick={() => deletePhone(phone.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
                {editMode ? (
                  <form onSubmit={addPhone} className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={newPhone.phone}
                      onChange={(e) => setNewPhone({ ...newPhone, phone: e.target.value })}
                      placeholder="Phone number"
                      required
                    />
                    <Input
                      value={newPhone.note}
                      onChange={(e) => setNewPhone({ ...newPhone, note: e.target.value })}
                      placeholder="Note (e.g. spouse, office)"
                    />
                    <Button type="submit" className="w-fit sm:col-span-2">
                      <Plus className="h-4 w-4" />
                      Add phone
                    </Button>
                  </form>
                ) : null}
              </div>
            </CardContent>
          </Card>
          {customer && (
            <CustomerTagsSection
              customerId={customer.id}
              tags={customer.tags ?? []}
              disabled={!canManage}
              onUpdated={(tags) => setCustomer({ ...customer, tags })}
            />
          )}
          {customer && (
            <CustomerPaymentMethodsSection
              customerId={customer.id}
              customerEmail={customer.email}
              canManage={canManagePayments}
            />
          )}
          <CustomerNotesAttachmentsTab customerId={customerId} />
        </TabsContent>

        <TabsContent value="properties" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Properties</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {properties.map((property) => (
                <div key={property.id} id={`property-${property.id}`} className="scroll-mt-6 space-y-3">
                  <div className="flex items-start justify-between rounded-md border p-3">
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
                      <PropertyIrrigationSummary
                        zoneCount={property.irrigationZoneCount}
                        shutoffValveLocation={property.shutoffValveLocation}
                        controllerLocation={property.controllerLocation}
                        irrigationMapStatus={property.irrigationMapStatus}
                      />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => deleteProperty(property.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <RachioPropertyPanel
                    customerId={customerId}
                    propertyId={property.id}
                    propertyName={property.name}
                  />
                  <PropertyIrrigationWizard customerId={customerId} propertyId={property.id} />
                  {property.designProjectId && process.env.NEXT_PUBLIC_DESIGN_URL ? (
                    <a
                      href={`${process.env.NEXT_PUBLIC_DESIGN_URL.replace(/\/$/, "")}/projects/${property.designProjectId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary underline"
                    >
                      Open design project
                    </a>
                  ) : null}
                  <PropertyIrrigationEditor customerId={customerId} propertyId={property.id} />
                  <CustomerPropertyMap
                    title={`${property.name} map`}
                    location={{
                      address: property.address,
                      city: property.city,
                      state: property.state,
                      zip: property.zip,
                    }}
                  />
                </div>
              ))}

              <form onSubmit={addProperty} className="grid gap-2 border-t pt-4 sm:grid-cols-2">
                <Input
                  value={newProperty.name}
                  onChange={(e) => setNewProperty({ ...newProperty, name: e.target.value })}
                  placeholder="Property name"
                  required
                  className="sm:col-span-2"
                />
                <AddressFields
                  addressLabel="Property address"
                  value={newProperty}
                  onChange={(fields) => setNewProperty((prev) => ({ ...prev, ...fields }))}
                />
                <Button type="submit" className="sm:col-span-2">
                  <Plus className="h-4 w-4" />
                  Add property
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="visits" className="space-y-4">
          <div className="flex justify-end">
            <Button type="button" onClick={() => setVisitOpen(true)}>
              <Plus className="h-4 w-4" />
              Add visit
            </Button>
          </div>
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
                      <TableHead>Paid</TableHead>
                      <TableHead>Created</TableHead>
                      {canRefund ? <TableHead className="text-right">Actions</TableHead> : null}
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
                        <TableCell>{formatCurrency(invoice.amountPaid ?? 0)}</TableCell>
                        <TableCell>{format(new Date(invoice.createdAt), "MMM d, yyyy")}</TableCell>
                        {canRefund ? (
                          <TableCell className="text-right">
                            {invoice.amountPaid > 0 && invoice.status !== "REFUNDED" ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setRefundInvoiceId(invoice.id)}
                              >
                                Refund
                              </Button>
                            ) : null}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-4">
          <div className="flex justify-end">
            <Button type="button" onClick={openEnrollModal}>
              <Plus className="h-4 w-4" />
              Enroll in plan
            </Button>
          </div>

          <Card>
            <CardContent className="pt-6">
              {enrollments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No maintenance plan enrollments.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plan</TableHead>
                      <TableHead>Property</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Billing</TableHead>
                      <TableHead>Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enrollments.map((enrollment) => (
                      <TableRow key={enrollment.id}>
                        <TableCell>
                          <Link
                            href={`/maintenance-plans/enrollments/${enrollment.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {enrollment.template.name}
                          </Link>
                        </TableCell>
                        <TableCell>{enrollment.property.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{enrollment.status.replace(/_/g, " ")}</Badge>
                        </TableCell>
                        <TableCell>{BILLING_FREQUENCY_LABELS[enrollment.billingFrequency]}</TableCell>
                        <TableCell>{formatCurrency(enrollment.template.basePrice)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

        </TabsContent>
      </Tabs>

      <CreateCustomerVisitModal
        open={visitOpen}
        onClose={() => setVisitOpen(false)}
        customer={customer}
        properties={properties}
      />

      <ConfirmModal
        title="Delete customer?"
        message="Are you sure you want to delete this customer? All related records will be removed or unlinked. This cannot be undone."
        confirmLabel="Yes, delete customer"
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={deleteCustomer}
        destructive
        loading={actionLoading}
      />

      {mergeOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => setMergeOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-lg border bg-background shadow-lg">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="font-semibold">Merge into another customer</h2>
              <Button variant="ghost" size="icon" onClick={() => setMergeOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4 p-4">
              <p className="text-sm text-muted-foreground">
                All visits, estimates, invoices, properties, and notes from{" "}
                <strong>{customer.name}</strong> will move to the customer you select. This profile
                will be deleted.
              </p>
              <Input
                value={mergeSearch}
                onChange={(e) => searchMergeCandidates(e.target.value)}
                placeholder="Search customers by name, email, or phone..."
                autoFocus
              />
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border">
                {mergeCandidates.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    {mergeSearch.trim() ? "No matching customers." : "Type to search."}
                  </p>
                ) : (
                  mergeCandidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      className={`block w-full px-3 py-2 text-left text-sm hover:bg-muted ${
                        mergeTargetId === candidate.id ? "bg-muted font-medium" : ""
                      }`}
                      onClick={() => setMergeTargetId(candidate.id)}
                    >
                      {candidate.name}
                      {candidate.email ? ` · ${candidate.email}` : ""}
                      {candidate.phone ? ` · ${candidate.phone}` : ""}
                    </button>
                  ))
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  disabled={!mergeTargetId || actionLoading}
                  onClick={mergeCustomer}
                >
                  {actionLoading ? "Merging..." : "Merge customers"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setMergeOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <EnrollPlanModal
        key={customerId}
        customerId={customerId}
        properties={properties}
        open={enrollOpen}
        onClose={() => setEnrollOpen(false)}
        onEnrolled={load}
      />

      {refundInvoiceId && customer ? (
        <IssueRefundDialog
          invoiceId={refundInvoiceId}
          invoiceNumber={
            invoices.find((invoice) => invoice.id === refundInvoiceId)?.invoiceNumber ?? ""
          }
          customerName={customer.name}
          open
          onClose={() => setRefundInvoiceId(null)}
          onRefunded={() => load()}
        />
      ) : null}
    </div>
  );
}
