import { priceBookSidebar } from "@/config/navigation";
import { ModuleLayout } from "@/components/layout/ModuleLayout";

export default function PriceBookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ModuleLayout title="Price book" sections={priceBookSidebar}>
      {children}
    </ModuleLayout>
  );
}
