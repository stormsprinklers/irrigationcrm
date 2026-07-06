import { customersSidebar } from "@/config/navigation";
import { ModuleLayout } from "@/components/layout/ModuleLayout";

export default function CustomersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ModuleLayout title="Customers" sections={customersSidebar}>
      {children}
    </ModuleLayout>
  );
}
