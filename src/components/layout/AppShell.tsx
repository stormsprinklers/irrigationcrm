import { VoiceDeviceProvider } from "@/contexts/VoiceDeviceProvider";
import { CompanyBrandProvider } from "@/components/layout/CompanyBrandProvider";
import { TopNav } from "@/components/layout/TopNav";
import { OutboundCommsBanner } from "@/components/layout/OutboundCommsBanner";
import { RolePreviewBanner } from "@/components/layout/RolePreviewBanner";
import { ActiveCallBar } from "@/components/voice/ActiveCallBar";
import { IncomingCallModal } from "@/components/voice/IncomingCallModal";
import { InboxBadgesProvider } from "@/contexts/InboxBadgesProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const mobile = (await cookies()).get("crm-mobile-shell")?.value === "1";
  const session = await auth();
  // Keep native Twilio calling in charge while using field web tools.
  if (mobile && session?.user) {
    return <VoiceDeviceProvider enabled={false}><InboxBadgesProvider><CompanyBrandProvider><TooltipProvider delayDuration={200}>
      <div data-native-shell="true" className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-page">
        <OutboundCommsBanner />
        <main className="relative min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </TooltipProvider></CompanyBrandProvider></InboxBadgesProvider></VoiceDeviceProvider>;
  }
  return (
    <VoiceDeviceProvider>
      <InboxBadgesProvider>
        <CompanyBrandProvider>
          <TooltipProvider delayDuration={200}>
          <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-page">
            <TopNav />
            <RolePreviewBanner />
            <OutboundCommsBanner />
            <main className="relative min-h-0 flex-1 overflow-auto">{children}</main>
            <ActiveCallBar />
            <IncomingCallModal />
          </div>
          </TooltipProvider>
        </CompanyBrandProvider>
      </InboxBadgesProvider>
    </VoiceDeviceProvider>
  );
}
