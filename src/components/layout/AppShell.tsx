import { VoiceDeviceProvider } from "@/contexts/VoiceDeviceProvider";
import { TopNav } from "@/components/layout/TopNav";
import { ActiveCallBar } from "@/components/voice/ActiveCallBar";
import { IncomingCallModal } from "@/components/voice/IncomingCallModal";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <VoiceDeviceProvider>
      <div className="flex min-h-screen flex-col bg-page">
        <TopNav />
        <main className="flex-1 pb-16">{children}</main>
        <ActiveCallBar />
        <IncomingCallModal />
      </div>
    </VoiceDeviceProvider>
  );
}
