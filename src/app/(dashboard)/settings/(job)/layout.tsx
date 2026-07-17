import { jobSettingsSidebar } from "@/config/navigation";
import { ModuleLayout } from "@/components/layout/ModuleLayout";

export default function JobSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ModuleLayout title="Job settings" sections={jobSettingsSidebar} className="min-h-full" desktopSidebarOnly>
      {children}
    </ModuleLayout>
  );
}
