import { VoiceDeviceProvider } from "@/contexts/VoiceDeviceProvider";
import { TopNav } from "@/components/layout/TopNav";
import { OutboundCommsBanner } from "@/components/layout/OutboundCommsBanner";
import { ActiveCallBar } from "@/components/voice/ActiveCallBar";
import { IncomingCallModal } from "@/components/voice/IncomingCallModal";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <VoiceDeviceProvider>
      <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-page">
        <TopNav />
        <OutboundCommsBanner />
        <main className="relative min-h-0 flex-1 overflow-auto pb-16 xl:pb-0">{children}</main>
        <ActiveCallBar />
        <IncomingCallModal />
      </div>
    </VoiceDeviceProvider>
  );
}
