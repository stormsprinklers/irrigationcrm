import { voiceSettingsSidebar } from "@/config/navigation";
import { ModuleLayout } from "@/components/layout/ModuleLayout";

export default function VoiceSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ModuleLayout title="Voice" sections={voiceSettingsSidebar} className="min-h-full">
      {children}
    </ModuleLayout>
  );
}
