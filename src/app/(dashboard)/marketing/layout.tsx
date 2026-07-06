import { marketingSidebar } from "@/config/navigation";
import { ModuleLayout } from "@/components/layout/ModuleLayout";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ModuleLayout title="Marketing" sections={marketingSidebar}>
      {children}
    </ModuleLayout>
  );
}
