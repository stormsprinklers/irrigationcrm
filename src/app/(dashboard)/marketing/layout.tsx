import { marketingSidebar } from "@/config/navigation";
import { ModuleSidebar } from "@/components/layout/ModuleSidebar";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      <ModuleSidebar title="Marketing" sections={marketingSidebar} />
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
