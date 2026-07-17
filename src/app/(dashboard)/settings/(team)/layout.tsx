import { teamSettingsSidebar } from "@/config/navigation";
import { ModuleLayout } from "@/components/layout/ModuleLayout";

export default function TeamSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ModuleLayout title="Team" sections={teamSettingsSidebar} className="min-h-full" desktopSidebarOnly>
      {children}
    </ModuleLayout>
  );
}
