import { priceBookSettingsSidebar } from "@/config/navigation";
import { ModuleSidebar } from "@/components/layout/ModuleSidebar";

export default function PriceBookSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full">
      <ModuleSidebar title="Price Book" sections={priceBookSettingsSidebar} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
