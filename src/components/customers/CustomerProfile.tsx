"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { ArrowLeft, ChevronDown, GitMerge, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { formatPhoneDisplay } from "@/lib/inbox/phone";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CustomerNameWithBadge } from "@/components/customers/CustomerNameWithBadge";
import {
  CustomerEmailAction,
  CustomerPhoneActions,
} from "@/components/customers/CustomerContactActions";
import { CustomerNotesAttachmentsTab } from "@/components/customers/CustomerNotesAttachmentsTab";
import { CustomerCallsTab } from "@/components/customers/CustomerCallsTab";
import { CustomerPaymentMethodsSection } from "@/components/customers/CustomerPaymentMethodsSection";
import { CustomerPropertyMap } from "@/components/customers/CustomerPropertyMap";
import { CustomerSummaryCard } from "@/components/customers/CustomerSummaryCard";
import { CustomerTagsSection } from "@/components/customers/CustomerTagsSection";
import { CustomerReferralsSection } from "@/components/customers/CustomerReferralsSection";
import { AddressFields } from "@/components/customers/AddressFields";
import { canFlagDoNotService, canManageCustomers } from "@/lib/customers/permissions";
import { marketingConsentLabel } from "@/lib/marketing/opt-out";
import { canViewMaintenancePlansNav } from "@/lib/settings/access";
import { useIrrigationFeatures, useHolidayLightingFeatures, useMaintenancePlansFeatures } from "@/components/layout/CompanyBrandProvider";
import { buildGoogleMapsUrl, formatCustomerAddress } from "@/lib/customers/maps";
import { attributionChannelLabel } from "@/lib/attribution/normalize";
import { IssueRefundDialog } from "@/components/invoices/IssueRefundDialog";
import { DeleteInvoiceDialog } from "@/components/invoices/DeleteInvoiceDialog";
import { InvoiceNotesDialog } from "@/components/invoices/InvoiceNotesDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { canAccessInvoices, canIssueRefunds } from "@/lib/invoices/permissions";
import { EnrollPlanModal } from "@/components/maintenance-plans/EnrollPlanModal";
import { RachioPropertyPanel } from "@/components/rachio/RachioPropertyPanel";
import { PropertyIrrigationWizard } from "@/components/customers/PropertyIrrigationWizard";
import { PropertyIrrigationSummary } from "@/components/customers/PropertyIrrigationSummary";
import { formatCurrency } from "@/lib/maintenance-plans/format";
import { CustomerMaintenancePlansTab } from "@/components/customers/CustomerMaintenancePlansTab";
import type { EnrollmentDTO } from "@/lib/maintenance-plans/types";
import type { CustomerDTO, CustomerPhoneDTO, CustomerPropertyDTO } from "@/lib/customers/types";
import { createDraftVisit } from "@/lib/schedule/create-draft";
import { holidayEstimateWizardUrl } from "@/lib/holiday-lighting/routes";

const EMPTY_PROPERTY_FORM = {
  name: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  latitude: null as number | null,
  longitude: null as number | null,
  isPrimary: false,
};

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

function ConsentBadge({ value }: { value: boolean }) {
  const optedOut = Boolean(value);
  return (
    <Badge variant={optedOut ? "destructive" : "success"}>
      {marketingConsentLabel(optedOut)}
    </Badge>
  );
}

function MarketingConsentSelect({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <select
        className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        value={value ? "out" : "in"}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "out")}
      >
        <option value="in">Opted in</option>
        <option value="out">Opted out</option>
      </select>
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
  const { enabled: irrigationEnabled } = useIrrigationFeatures();
  const { enabled: holidayEnabled, loading: holidayFeaturesLoading } =
    useHolidayLightingFeatures();
  const { enabled: maintenanceEnabled } = useMaintenancePlansFeatures();
  const validTabs = useMemo(() => new Set([
    "profile",
    "visits",
    "calls",
    "estimates",
    "invoices",
    ...(maintenanceEnabled ? (["maintenance"] as const) : []),
  ]), [maintenanceEnabled]);
  const tabFromUrl = searchParams.get("tab");
  const propertyIdFromUrl = searchParams.get("propertyId");
  const initialTab =
    tabFromUrl === "notes" || tabFromUrl === "properties" || propertyIdFromUrl
      ? "profile"
      : tabFromUrl && validTabs.has(tabFromUrl)
        ? tabFromUrl
        : "profile";
  const [activeTab, setActiveTab] = useState(initialTab);
  const userRole = session?.user?.role ?? "TECH";
  const canManage = canManageCustomers(userRole);
  const canFlagDns = canFlagDoNotService(userRole);
  const canViewInvoices = canAccessInvoices(userRole);
  const canRefund = canIssueRefunds(userRole);
  const canManagePayments =
    userRole === "CSR" || userRole === "MANAGER" || userRole === "ADMIN";
  const canManageProperties = userRole !== "TECH" && userRole !== "INSTALLER";
  const showMaintenance = maintenanceEnabled && canViewMaintenancePlansNav(userRole);
  const [customer, setCustomer] = useState<CustomerDTO | null>(null);
  const [properties, setProperties] = useState<CustomerPropertyDTO[]>([]);
  const [phones, setPhones] = useState<CustomerPhoneDTO[]>([]);
  const [visits, setVisits] = useState<
    Array<{
      id: string;
      title: string;
      status: string;
      startAt: string;
      total?: number;
      assignedUser?: { id: string; name: string } | null;
      crew?: { id: string; name: string } | null;
    }>
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
      balanceDue?: number;
      publicToken?: string;
      createdAt: string;
      visit?: { id: string; title: string } | null;
      maintenancePlanEnrollment?: { id: string; planName: string } | null;
    }>
  >([]);
  const [enrollments, setEnrollments] = useState<EnrollmentDTO[]>([]);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [creatingVisit, setCreatingVisit] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeCandidates, setMergeCandidates] = useState<CustomerDTO[]>([]);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [refundInvoiceId, setRefundInvoiceId] = useState<string | null>(null);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<string | null>(null);
  const [voidInvoiceId, setVoidInvoiceId] = useState<string | null>(null);
  const [notesInvoiceId, setNotesInvoiceId] = useState<string | null>(null);
  const [invoiceActingId, setInvoiceActingId] = useState<string | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newProperty, setNewProperty] = useState(EMPTY_PROPERTY_FORM);
  const [addPropertyOpen, setAddPropertyOpen] = useState(false);
  const [addingProperty, setAddingProperty] = useState(false);
  const [editingProperty, setEditingProperty] = useState<CustomerPropertyDTO | null>(null);
  const [propertyDraft, setPropertyDraft] = useState(EMPTY_PROPERTY_FORM);
  const [savingProperty, setSavingProperty] = useState(false);
  const [propertyPendingDelete, setPropertyPendingDelete] =
    useState<CustomerPropertyDTO | null>(null);
  const [deletingProperty, setDeletingProperty] = useState(false);
  const [expandedPropertyIds, setExpandedPropertyIds] = useState<Set<string>>(
    () => new Set(propertyIdFromUrl ? [propertyIdFromUrl] : [])
  );
  const [newPhone, setNewPhone] = useState({ phone: "", note: "" });
  const [editMode, setEditMode] = useState(false);
  const [draftCustomer, setDraftCustomer] = useState<CustomerDTO | null>(null);
  const appliedEditQuery = useRef(false);
  const canViewComms = customer?.canViewCustomerComms !== false;

  useEffect(() => {
    if (!customer) return;
    if (activeTab === "calls" && !canViewComms) setActiveTab("profile");
    if (activeTab === "maintenance" && !showMaintenance) setActiveTab("profile");
  }, [customer, activeTab, canViewComms, showMaintenance]);

  useEffect(() => {
    if (tabFromUrl && validTabs.has(tabFromUrl)) {
      if (tabFromUrl === "invoices" && !canViewInvoices) {
        setActiveTab("profile");
      } else {
        setActiveTab(tabFromUrl);
      }
    } else if (tabFromUrl === "properties" || propertyIdFromUrl) {
      setActiveTab("profile");
    }
  }, [tabFromUrl, propertyIdFromUrl, canViewInvoices, validTabs]);

  useEffect(() => {
    if (!propertyIdFromUrl || loading || !properties.some((p) => p.id === propertyIdFromUrl)) {
      return;
    }
    setExpandedPropertyIds((current) => new Set(current).add(propertyIdFromUrl));
    window.requestAnimationFrame(() => {
      document.getElementById(`property-${propertyIdFromUrl}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [propertyIdFromUrl, properties, loading]);

  function setPropertyExpanded(propertyId: string, expanded: boolean) {
    setExpandedPropertyIds((current) => {
      const next = new Set(current);
      if (expanded) next.add(propertyId);
      else next.delete(propertyId);
      return next;
    });
  }

  const load = useCallback(async () => {
    const [customerRes, propertiesRes, phonesRes, estimatesRes, invoicesRes, enrollmentsRes] =
      await Promise.all([
      fetch(`/api/customers/${customerId}`),
      fetch(`/api/customers/${customerId}/properties`),
      fetch(`/api/customers/${customerId}/phones`),
      fetch(`/api/estimates?customerId=${customerId}`),
      canViewInvoices
        ? fetch(`/api/invoices?customerId=${customerId}`)
        : Promise.resolve(null),
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
    if (invoicesRes?.ok) {
      const data = await invoicesRes.json();
      setInvoices(data.invoices ?? []);
    } else if (!canViewInvoices) {
      setInvoices([]);
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
  }, [customerId, canViewInvoices]);

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
      setCustomer({
        ...updated,
        canViewCustomerComms: updated.canViewCustomerComms ?? customer?.canViewCustomerComms,
      });
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

  const startInEdit = searchParams.get("edit") === "1";
  useEffect(() => {
    if (appliedEditQuery.current || !startInEdit || !customer) return;
    appliedEditQuery.current = true;
    setDraftCustomer({ ...customer });
    setEditMode(true);
    router.replace(`/customers/${customer.id}`, { scroll: false });
  }, [startInEdit, customer, router]);

  async function addVisit() {
    if (!customer || creatingVisit) return;
    if (customer.doNotService) {
      toast.error("This customer is marked DO NOT SERVICE and cannot be scheduled");
      return;
    }
    setCreatingVisit(true);
    try {
      const visit = await createDraftVisit({ customerId: customer.id });
      router.push(`/visits/${visit.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create visit");
    } finally {
      setCreatingVisit(false);
    }
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
  async function addProperty(e: React.FormEvent) {
    e.preventDefault();
    if (!newProperty.name.trim()) return;
    const payload = { ...newProperty, isPrimary: newProperty.isPrimary || properties.length === 0 };
    setAddingProperty(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/properties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toast.error("Failed to add property");
        return;
      }
      await res.json().catch(() => null);
      setNewProperty(EMPTY_PROPERTY_FORM);
      setAddPropertyOpen(false);
      const propsRes = await fetch(`/api/customers/${customerId}/properties`);
      if (propsRes.ok) {
        const data = await propsRes.json();
        const list: CustomerPropertyDTO[] = Array.isArray(data) ? data : [];
        setProperties(list);
      }
      toast.success("Property added");
    } finally {
      setAddingProperty(false);
    }
  }

  function startEditingProperty(property: CustomerPropertyDTO) {
    setEditingProperty(property);
    setPropertyDraft({
      name: property.name,
      address: property.address ?? "",
      city: property.city ?? "",
      state: property.state ?? "",
      zip: property.zip ?? "",
      latitude: null,
      longitude: null,
      isPrimary: property.isPrimary,
    });
  }

  async function saveProperty(e: React.FormEvent) {
    e.preventDefault();
    if (!editingProperty || !propertyDraft.name.trim()) return;
    setSavingProperty(true);
    try {
      const res = await fetch(
        `/api/customers/${customerId}/properties/${editingProperty.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(propertyDraft),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to update property");
        return;
      }
      const updated = data as CustomerPropertyDTO;
      setProperties((current) =>
        current.map((property) => {
          if (property.id === updated.id) return updated;
          return updated.isPrimary ? { ...property, isPrimary: false } : property;
        })
      );
      setEditingProperty(null);
      toast.success("Property updated");
    } catch {
      toast.error("Failed to update property");
    } finally {
      setSavingProperty(false);
    }
  }

  async function deleteProperty() {
    if (!propertyPendingDelete) return;
    setDeletingProperty(true);
    try {
      const res = await fetch(
        `/api/customers/${customerId}/properties/${propertyPendingDelete.id}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to delete property");
        return;
      }
      setProperties((current) => {
        const next = current.filter((property) => property.id !== propertyPendingDelete.id);
        if (propertyPendingDelete.isPrimary && next.length > 0) {
          return next.map((property, index) => ({ ...property, isPrimary: index === 0 }));
        }
        return next;
      });
      setPropertyPendingDelete(null);
      toast.success("Property deleted");
    } catch {
      toast.error("Failed to delete property");
    } finally {
      setDeletingProperty(false);
    }
  }

  async function refreshInvoices() {
    if (!canViewInvoices) return;
    const res = await fetch(`/api/invoices?customerId=${customerId}`);
    if (!res.ok) return;
    const data = await res.json();
    setInvoices(data.invoices ?? []);
  }

  async function remindInvoice(invoiceId: string) {
    setInvoiceActingId(invoiceId);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/remind`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.payUrl) {
          await navigator.clipboard.writeText(data.payUrl);
          toast.message(data.error ?? "Could not send reminder", {
            description: "Pay link copied to clipboard.",
          });
        } else {
          toast.error(data.error ?? "Failed to send reminder");
        }
        return;
      }
      toast.success("Payment reminder sent");
      await refreshInvoices();
    } finally {
      setInvoiceActingId(null);
    }
  }

  async function voidInvoice(invoiceId: string) {
    setInvoiceActingId(invoiceId);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/void`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to void invoice");
        return false;
      }
      toast.success("Invoice voided");
      await refreshInvoices();
      return true;
    } finally {
      setInvoiceActingId(null);
    }
  }

  async function confirmVoidInvoice() {
    if (!voidInvoiceId) return;
    const ok = await voidInvoice(voidInvoiceId);
    if (ok) setVoidInvoiceId(null);
  }

  async function confirmDeleteInvoice(voidFirst: boolean) {
    if (!deleteInvoiceId) return;
    setDeletingInvoice(true);
    try {
      const res = await fetch(`/api/invoices/${deleteInvoiceId}`, {
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
      setDeleteInvoiceId(null);
      await refreshInvoices();
    } finally {
      setDeletingInvoice(false);
    }
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
        toast.error("Add a property on the customer profile before enrolling in a plan.");
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
    if (holidayEnabled) {
      window.location.href = holidayEstimateWizardUrl({
        customerId,
        customerName: customer?.name,
        address: customer?.address,
        city: customer?.city,
        state: customer?.state,
        zip: customer?.zip,
      });
      return;
    }
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        toast.error(typeof data.error === "string" ? data.error : "Failed to delete customer");
        return;
      }
      toast.success("Customer deleted");
      router.replace("/customers");
      router.refresh();
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
            <Link href={customer.isContact ? "/customers/contacts" : "/customers"}>
              <ArrowLeft className="h-4 w-4" />
              {customer.isContact ? "Contacts" : "Customers"}
            </Link>
          </Button>
          <CustomerNameWithBadge
            name={customer.name}
            doNotService={customer.doNotService}
            isContact={customer.isContact}
            className="text-2xl font-semibold"
            nameClassName="text-2xl font-semibold"
          />
          {customer.status === "ARCHIVED" && (
            <Badge variant="outline" className="mt-2">
              Archived
            </Badge>
          )}
          {customer.companyName && <p className="text-muted-foreground">{customer.companyName}</p>}
          {(customer.attributionChannel || customer.leadSource) && (
            <p className="mt-1 text-sm text-muted-foreground">
              First touch:{" "}
              <span className="font-medium text-foreground">
                {customer.attributionChannel
                  ? attributionChannelLabel(customer.attributionChannel)
                  : customer.leadSource}
              </span>
              {customer.attributionCampaign
                ? ` · ${customer.attributionCampaign}`
                : customer.attributionSource
                  ? ` · ${customer.attributionSource}`
                  : null}
              {customer.leadSource &&
              customer.attributionChannel &&
              customer.leadSource !== attributionChannelLabel(customer.attributionChannel)
                ? ` (${customer.leadSource})`
                : null}
            </p>
          )}
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

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value);
          const params = new URLSearchParams(searchParams.toString());
          params.set("tab", value);
          const qs = params.toString();
          router.replace(`/customers/${customerId}?${qs}`, { scroll: false });
        }}
      >
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="visits">Visits</TabsTrigger>
          {canViewComms ? <TabsTrigger value="calls">Calls</TabsTrigger> : null}
          <TabsTrigger value="estimates">Estimates</TabsTrigger>
          {canViewInvoices ? <TabsTrigger value="invoices">Invoices</TabsTrigger> : null}
          {showMaintenance ? (
            <TabsTrigger value="maintenance">Maintenance Plans</TabsTrigger>
          ) : null}
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
                    value={formatPhoneDisplay(customer.phone) || null}
                    actions={
                      canViewComms ? (
                      <CustomerPhoneActions
                        customerId={customer.id}
                        name={customer.name}
                        phone={customer.phone}
                      />
                      ) : null
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
                  {customer.secondaryEmails?.length ? (
                    <ProfileDetail label="Secondary emails" value={customer.secondaryEmails.join(", ")} />
                  ) : null}
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
                  <ProfileDetail
                    label="First-touch channel"
                    value={
                      customer.attributionChannel
                        ? [
                            attributionChannelLabel(customer.attributionChannel),
                            customer.attributionCampaign || customer.attributionSource,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : null
                    }
                  />
                  {customer.doNotService ? (
                    <div className="sm:col-span-2">
                      <Badge variant="destructive">Do not service</Badge>
                    </div>
                  ) : null}
                  <div className="sm:col-span-2 rounded-md border p-3 text-sm">
                    <p className="mb-2 font-medium">Messaging preferences</p>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      <li>
                        <span className="text-muted-foreground">Marketing email:</span>{" "}
                        <ConsentBadge value={customer.marketingEmailOptOut} />
                      </li>
                      <li>
                        <span className="text-muted-foreground">Marketing SMS:</span>{" "}
                        <ConsentBadge value={customer.marketingSmsOptOut} />
                      </li>
                      <li>
                        Appointment email:{" "}
                        {customer.appointmentReminderEmailOptOut ? "Off" : "On"}
                      </li>
                      <li>
                        Appointment SMS:{" "}
                        {customer.appointmentReminderSmsOptOut ? "Off" : "On"}
                      </li>
                    </ul>
                  </div>
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
                              marketingEmailOptOut: Boolean(checked) || profileCustomer.marketingEmailOptOut,
                              marketingSmsOptOut: Boolean(checked) || profileCustomer.marketingSmsOptOut,
                              appointmentReminderEmailOptOut: Boolean(checked) || profileCustomer.appointmentReminderEmailOptOut,
                              appointmentReminderSmsOptOut: Boolean(checked) || profileCustomer.appointmentReminderSmsOptOut,
                            })
                          }
                        />
                        Mark as DO NOT SERVICE (blocks booking and opts out of marketing email and SMS)
                      </label>
                    </div>
                  )}
                  <div className="sm:col-span-2 rounded-md border p-3">
                    <p className="mb-2 text-sm font-medium">Messaging preferences</p>
                    <p className="mb-3 text-xs text-muted-foreground">
                      New customers are opted in. Texting STOP (nothing else) removes them from
                      active campaigns and opts them out of marketing email and SMS. START restores
                      marketing SMS only.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <MarketingConsentSelect
                        label="Marketing email"
                        value={profileCustomer.marketingEmailOptOut}
                        disabled={profileCustomer.doNotService}
                        onChange={(marketingEmailOptOut) =>
                          setDraftCustomer({ ...profileCustomer, marketingEmailOptOut })
                        }
                      />
                      <MarketingConsentSelect
                        label="Marketing SMS"
                        value={profileCustomer.marketingSmsOptOut}
                        disabled={profileCustomer.doNotService}
                        onChange={(marketingSmsOptOut) =>
                          setDraftCustomer({ ...profileCustomer, marketingSmsOptOut })
                        }
                      />
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={!profileCustomer.appointmentReminderEmailOptOut}
                          disabled={profileCustomer.doNotService}
                          onCheckedChange={(checked) =>
                            setDraftCustomer({
                              ...profileCustomer,
                              appointmentReminderEmailOptOut: !Boolean(checked),
                            })
                          }
                        />
                        Appointment reminder email
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={!profileCustomer.appointmentReminderSmsOptOut}
                          disabled={profileCustomer.doNotService}
                          onCheckedChange={(checked) =>
                            setDraftCustomer({
                              ...profileCustomer,
                              appointmentReminderSmsOptOut: !Boolean(checked),
                            })
                          }
                        />
                        Appointment reminder SMS
                      </label>
                    </div>
                  </div>
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
                            <p className="font-medium">{formatPhoneDisplay(phone.phone)}</p>
                            {!editMode && customer && canViewComms ? (
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
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-base">Properties</CardTitle>
              <div className="flex flex-wrap gap-2">
                {holidayEnabled ? (
                  <Button type="button" size="sm" variant="outline" asChild>
                    <Link href={`/holiday-lighting/quote/new?customerId=${customerId}`}>
                      Holiday lighting quote
                    </Link>
                  </Button>
                ) : null}
                {canManageProperties ? (
                  <Button type="button" size="sm" onClick={() => setAddPropertyOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Add property
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              {properties.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {irrigationEnabled
                    ? "No properties yet. Add one to manage irrigation, Rachio, and service locations."
                    : "No properties yet. Add one to manage service locations."}
                </p>
              ) : (
                <div className="space-y-3">
                  {properties.map((property) => (
                    <div
                      key={property.id}
                      id={`property-${property.id}`}
                      className="relative scroll-mt-6 rounded-md border"
                    >
                      <details
                        className="group"
                        open={expandedPropertyIds.has(property.id)}
                        onToggle={(event) =>
                          setPropertyExpanded(property.id, event.currentTarget.open)
                        }
                      >
                        <summary className="flex cursor-pointer list-none items-start gap-3 p-4 pr-24 marker:hidden">
                          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                          <div className="min-w-0">
                            <div className="font-medium">
                              {property.name}
                              {property.isPrimary ? (
                                <Badge variant="outline" className="ml-2">
                                  Primary
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {formatCustomerAddress(property) ?? "No address on file"}
                            </p>
                          </div>
                        </summary>

                        {expandedPropertyIds.has(property.id) ? (
                          <div className="space-y-4 border-t p-4">
                            <CustomerPropertyMap
                              title={`${property.name} location`}
                              location={property}
                            />
                            {irrigationEnabled ? (
                              <>
                                <PropertyIrrigationSummary
                                  zoneCount={property.irrigationZoneCount}
                                  shutoffValveLocation={property.shutoffValveLocation}
                                  controllerLocation={property.controllerLocation}
                                  irrigationMapStatus={property.irrigationMapStatus}
                                />
                                <RachioPropertyPanel
                                  customerId={customerId}
                                  propertyId={property.id}
                                  propertyName={property.name}
                                />
                                <PropertyIrrigationWizard
                                  customerId={customerId}
                                  propertyId={property.id}
                                />
                              </>
                            ) : null}
                            {irrigationEnabled &&
                            property.designProjectId &&
                            process.env.NEXT_PUBLIC_DESIGN_URL ? (
                              <a
                                href={`${process.env.NEXT_PUBLIC_DESIGN_URL.replace(/\/$/, "")}/projects/${property.designProjectId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-primary underline"
                              >
                                Open design project
                              </a>
                            ) : null}
                          </div>
                        ) : null}
                      </details>

                      {canManageProperties ? (
                        <div className="absolute right-2 top-2 flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={`Edit ${property.name}`}
                            onClick={() => startEditingProperty(property)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            aria-label={`Delete ${property.name}`}
                            onClick={() => setPropertyPendingDelete(property)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
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
            <CustomerReferralsSection customerId={customer.id} disabled={!canManage} />
          )}
          {customer && (
            <CustomerPaymentMethodsSection
              customerId={customer.id}
              customerEmail={customer.email}
              customerPhone={customer.phone}
              canManage={canManagePayments}
            />
          )}
          <CustomerNotesAttachmentsTab customerId={customerId} />
        </TabsContent>

        <TabsContent value="visits" className="space-y-4">
          <div className="flex justify-end">
            <Button type="button" onClick={() => void addVisit()} disabled={creatingVisit}>
              <Plus className="h-4 w-4" />
              {creatingVisit ? "Creating…" : "Add visit"}
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
                      <TableHead>Technician(s)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visits.map((visit) => {
                      const technicians = [
                        visit.assignedUser?.name,
                        visit.crew?.name,
                      ].filter(Boolean);
                      return (
                      <TableRow key={visit.id}>
                        <TableCell>
                          <Link href={`/visits/${visit.id}`} className="font-medium text-primary hover:underline">
                            {visit.title}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {technicians.length > 0 ? technicians.join(", ") : "Unassigned"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{visit.status}</Badge>
                        </TableCell>
                        <TableCell>{format(new Date(visit.startAt), "MMM d, yyyy")}</TableCell>
                        <TableCell>
                          {visit.total != null ? formatCurrency(visit.total) : "—"}
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {canViewComms ? (
        <TabsContent value="calls" className="space-y-4">
          <CustomerCallsTab customerId={customerId} />
        </TabsContent>
        ) : null}

        <TabsContent value="estimates" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={createEstimate} disabled={holidayFeaturesLoading}>
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

        {canViewInvoices ? (
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
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((invoice) => {
                      const balanceDue =
                        invoice.balanceDue ??
                        Math.max(0, invoice.total - (invoice.amountPaid ?? 0));
                      const acting = invoiceActingId === invoice.id;
                      return (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{invoice.status}</Badge>
                        </TableCell>
                        <TableCell>{formatCurrency(invoice.total)}</TableCell>
                        <TableCell>{formatCurrency(invoice.amountPaid ?? 0)}</TableCell>
                        <TableCell>{format(new Date(invoice.createdAt), "MMM d, yyyy")}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-1">
                            {balanceDue > 0 &&
                            invoice.status !== "VOID" &&
                            invoice.status !== "REFUNDED" &&
                            invoice.publicToken ? (
                              <Button type="button" variant="ghost" size="sm" asChild>
                                <Link
                                  href={`/pay/${invoice.publicToken}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Take payment
                                </Link>
                              </Button>
                            ) : null}
                            {balanceDue > 0 && invoice.status !== "VOID" ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={acting}
                                onClick={() => void remindInvoice(invoice.id)}
                              >
                                Remind
                              </Button>
                            ) : null}
                            {balanceDue > 0 &&
                            invoice.status !== "VOID" &&
                            invoice.status !== "REFUNDED" ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setNotesInvoiceId(invoice.id)}
                              >
                                Notes
                              </Button>
                            ) : null}
                            {invoice.status !== "VOID" && invoice.status !== "REFUNDED" ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={acting}
                                onClick={() => setVoidInvoiceId(invoice.id)}
                              >
                                Void
                              </Button>
                            ) : null}
                            {invoice.visit ? (
                              <Button type="button" variant="ghost" size="sm" asChild>
                                <Link href={`/visits/${invoice.visit.id}`}>Visit Details</Link>
                              </Button>
                            ) : null}
                            {invoice.maintenancePlanEnrollment ? (
                              <Button type="button" variant="ghost" size="sm" asChild>
                                <Link
                                  href={`/maintenance-plans/enrollments/${invoice.maintenancePlanEnrollment.id}`}
                                  title={invoice.maintenancePlanEnrollment.planName}
                                >
                                  Plan
                                </Link>
                              </Button>
                            ) : null}
                            {canRefund &&
                            invoice.amountPaid > 0 &&
                            invoice.status !== "REFUNDED" ? (
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
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              disabled={acting}
                              onClick={() => setDeleteInvoiceId(invoice.id)}
                            >
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        ) : null}

        {showMaintenance ? (
        <TabsContent value="maintenance" className="space-y-4">
          <CustomerMaintenancePlansTab enrollments={enrollments} onEnroll={openEnrollModal} />
        </TabsContent>
        ) : null}
      </Tabs>

      {addPropertyOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => !addingProperty && setAddPropertyOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-lg border bg-background shadow-lg">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="font-semibold">Add property</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={addingProperty}
                onClick={() => setAddPropertyOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <form onSubmit={addProperty} className="grid gap-3 p-4 sm:grid-cols-2">
              <Input
                value={newProperty.name}
                onChange={(e) => setNewProperty({ ...newProperty, name: e.target.value })}
                placeholder="Property name"
                required
                className="sm:col-span-2"
                autoFocus
              />
              <AddressFields
                addressLabel="Property address"
                value={newProperty}
                onChange={(fields) => setNewProperty((prev) => ({ ...prev, ...fields }))}
              />
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Checkbox
                  checked={newProperty.isPrimary || properties.length === 0}
                  disabled={properties.length === 0}
                  onCheckedChange={(checked) =>
                    setNewProperty((current) => ({ ...current, isPrimary: Boolean(checked) }))
                  }
                />
                Primary property
              </label>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={addingProperty}
                  onClick={() => setAddPropertyOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={addingProperty}>
                  {addingProperty ? "Adding…" : "Add property"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editingProperty ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => !savingProperty && setEditingProperty(null)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-lg border bg-background shadow-lg">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="font-semibold">Edit property</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={savingProperty}
                onClick={() => setEditingProperty(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <form onSubmit={saveProperty} className="grid gap-3 p-4 sm:grid-cols-2">
              <Input
                value={propertyDraft.name}
                onChange={(e) =>
                  setPropertyDraft((current) => ({ ...current, name: e.target.value }))
                }
                placeholder="Property name"
                required
                className="sm:col-span-2"
                autoFocus
              />
              <AddressFields
                addressLabel="Property address"
                value={propertyDraft}
                onChange={(fields) =>
                  setPropertyDraft((current) => ({ ...current, ...fields }))
                }
              />
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Checkbox
                  checked={propertyDraft.isPrimary}
                  disabled={editingProperty.isPrimary}
                  onCheckedChange={(checked) =>
                    setPropertyDraft((current) => ({
                      ...current,
                      isPrimary: Boolean(checked),
                    }))
                  }
                />
                Primary property
              </label>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={savingProperty}
                  onClick={() => setEditingProperty(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={savingProperty || !propertyDraft.name.trim()}>
                  {savingProperty ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

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

      <ConfirmModal
        title="Delete property?"
        message={`Delete ${propertyPendingDelete?.name ?? "this property"}? Visits and estimates will remain, but property-specific irrigation, controller, and maintenance-plan data will be removed. This cannot be undone.`}
        confirmLabel="Delete property"
        open={Boolean(propertyPendingDelete)}
        onClose={() => !deletingProperty && setPropertyPendingDelete(null)}
        onConfirm={() => void deleteProperty()}
        destructive
        loading={deletingProperty}
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
                      {candidate.phone ? ` · ${formatPhoneDisplay(candidate.phone)}` : ""}
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
          onRefunded={() => void refreshInvoices()}
        />
      ) : null}

      {notesInvoiceId ? (
        <InvoiceNotesDialog
          invoiceId={notesInvoiceId}
          invoiceNumber={
            invoices.find((invoice) => invoice.id === notesInvoiceId)?.invoiceNumber ?? ""
          }
          open
          onClose={() => setNotesInvoiceId(null)}
        />
      ) : null}

      {voidInvoiceId ? (
        <ConfirmDialog
          open
          title="Void this invoice?"
          description={`This marks invoice ${
            invoices.find((invoice) => invoice.id === voidInvoiceId)?.invoiceNumber ?? ""
          } as void. It cannot be collected after that.`}
          confirmLabel="Void invoice"
          confirmVariant="destructive"
          busy={invoiceActingId === voidInvoiceId}
          onConfirm={() => void confirmVoidInvoice()}
          onCancel={() => {
            if (invoiceActingId !== voidInvoiceId) setVoidInvoiceId(null);
          }}
        />
      ) : null}

      {deleteInvoiceId ? (
        <DeleteInvoiceDialog
          open
          invoiceNumber={
            invoices.find((invoice) => invoice.id === deleteInvoiceId)?.invoiceNumber ?? ""
          }
          loading={deletingInvoice}
          onClose={() => !deletingInvoice && setDeleteInvoiceId(null)}
          onConfirm={(voidFirst) => void confirmDeleteInvoice(voidFirst)}
        />
      ) : null}
    </div>
  );
}
