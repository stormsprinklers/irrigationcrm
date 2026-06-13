import { settingsSidebar } from "@/config/navigation";
import { ModuleSidebar } from "@/components/layout/ModuleSidebar";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      <ModuleSidebar title="Settings" sections={settingsSidebar} />
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
