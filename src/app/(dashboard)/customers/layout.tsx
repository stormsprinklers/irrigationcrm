"use client";

import { useSession } from "next-auth/react";
import { customersSidebar } from "@/config/navigation";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import { canAccessInvoices } from "@/lib/invoices/permissions";

export default function CustomersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const role = session?.user?.role ?? "TECH";
  const sections = canAccessInvoices(role)
    ? customersSidebar
    : customersSidebar.map((section) => ({
        ...section,
        items: section.items.filter((item) => item.href !== "/customers/invoices"),
      }));

  return (
    <ModuleLayout title="Customers" sections={sections}>
      {children}
    </ModuleLayout>
  );
}
