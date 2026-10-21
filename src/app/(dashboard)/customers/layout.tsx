"use client";

import { useSession } from "next-auth/react";
import { customersSidebar } from "@/config/navigation";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import { canAccessInvoices } from "@/lib/invoices/permissions";
import { canViewSalesPipeline } from "@/lib/customers/permissions";

export default function CustomersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const role = session?.user?.role ?? "TECH";
  const sections = customersSidebar.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.href === "/customers/invoices" && !canAccessInvoices(role)) return false;
      if (item.href === "/customers/pipeline" && !canViewSalesPipeline(role)) return false;
      return true;
    }),
  }));

  return (
    <ModuleLayout title="Customers" sections={sections}>
      {children}
    </ModuleLayout>
  );
}
