import { VoiceDeviceProvider } from "@/contexts/VoiceDeviceProvider";
import { CompanyBrandProvider } from "@/components/layout/CompanyBrandProvider";
import { TopNav } from "@/components/layout/TopNav";
import { OutboundCommsBanner } from "@/components/layout/OutboundCommsBanner";
import { RolePreviewBanner } from "@/components/layout/RolePreviewBanner";
import { ActiveCallBar } from "@/components/voice/ActiveCallBar";
import { IncomingCallModal } from "@/components/voice/IncomingCallModal";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <VoiceDeviceProvider>
      <CompanyBrandProvider>
        <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-page">
          <TopNav />
          <RolePreviewBanner />
          <OutboundCommsBanner />
          <main className="relative min-h-0 flex-1 overflow-auto">{children}</main>
          <ActiveCallBar />
          <IncomingCallModal />
        </div>
      </CompanyBrandProvider>
    </VoiceDeviceProvider>
  );
}
