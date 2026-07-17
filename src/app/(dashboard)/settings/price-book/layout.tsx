import { priceBookSettingsSidebar } from "@/config/navigation";
import { ModuleLayout } from "@/components/layout/ModuleLayout";

export default function PriceBookSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ModuleLayout title="Price Book" sections={priceBookSettingsSidebar} className="min-h-full" desktopSidebarOnly>
      {children}
    </ModuleLayout>
  );
}
