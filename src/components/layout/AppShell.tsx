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
import { getSessionUser } from "@/lib/api-auth";
import { AffiliateNav } from "@/components/affiliate/AffiliateNav";
import { BulbPrepNav } from "@/components/bulb-prep/BulbPrepNav";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const mobile = (await cookies()).get("crm-mobile-shell")?.value === "1";
  const user = await getSessionUser();
  if (user?.role === "AFFILIATE") {
    return (
      <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-page">
        <AffiliateNav name={user.name} />
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    );
  }
  if (user?.role === "BULB_PREP") {
    return (
      <CompanyBrandProvider>
        <TooltipProvider delayDuration={200}>
          <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-page">
            <BulbPrepNav name={user.name} />
            <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
          </div>
        </TooltipProvider>
      </CompanyBrandProvider>
    );
  }
  // Keep native Twilio calling in charge while using field web tools.
  if (mobile && user) {
    return <VoiceDeviceProvider enabled={false}><InboxBadgesProvider><CompanyBrandProvider><TooltipProvider delayDuration={200}>
      <div data-native-shell="true" className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-page">
        <OutboundCommsBanner />
        <main className="crm-app-main relative min-h-0 flex-1 overflow-auto">{children}</main>
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
            <main className="crm-app-main relative min-h-0 flex-1 overflow-auto">{children}</main>
            <ActiveCallBar />
            <IncomingCallModal />
          </div>
          </TooltipProvider>
        </CompanyBrandProvider>
      </InboxBadgesProvider>
    </VoiceDeviceProvider>
  );
}
