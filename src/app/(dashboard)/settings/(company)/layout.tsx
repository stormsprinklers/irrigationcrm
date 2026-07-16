import { companySettingsSidebar } from "@/config/navigation";
import { ModuleLayout } from "@/components/layout/ModuleLayout";

export default function CompanySettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ModuleLayout title="Company" sections={companySettingsSidebar} className="min-h-full">
      {children}
    </ModuleLayout>
  );
}
