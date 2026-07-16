import { communicationsSettingsSidebar } from "@/config/navigation";
import { ModuleLayout } from "@/components/layout/ModuleLayout";

export default function CommunicationsSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ModuleLayout
      title="Communications"
      sections={communicationsSettingsSidebar}
      className="min-h-full"
    >
      {children}
    </ModuleLayout>
  );
}
