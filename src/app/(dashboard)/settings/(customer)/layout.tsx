import { customerSettingsSidebar } from "@/config/navigation";
import { ModuleLayout } from "@/components/layout/ModuleLayout";

export default function CustomerSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ModuleLayout title="Customer" sections={customerSettingsSidebar} className="min-h-full">
      {children}
    </ModuleLayout>
  );
}
