import { integrationsSettingsSidebar } from "@/config/navigation";
import { ModuleLayout } from "@/components/layout/ModuleLayout";

export default function IntegrationsSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ModuleLayout title="Integrations" sections={integrationsSettingsSidebar} className="min-h-full">
      {children}
    </ModuleLayout>
  );
}
