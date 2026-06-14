import { voiceSettingsSidebar } from "@/config/navigation";
import { ModuleSidebar } from "@/components/layout/ModuleSidebar";

export default function VoiceSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full">
      <ModuleSidebar title="Voice" sections={voiceSettingsSidebar} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
