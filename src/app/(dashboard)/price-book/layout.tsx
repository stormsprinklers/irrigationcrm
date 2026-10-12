import { priceBookSidebar } from "@/config/navigation";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import { auth } from "@/lib/auth";
import { canManagePriceBook } from "@/lib/price-book/permissions";
import { priceBookSettingsSidebar } from "@/config/navigation";

export default async function PriceBookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const sections = canManagePriceBook(session?.user?.role)
    ? [...priceBookSidebar, { title: "PRICING SETTINGS", items: priceBookSettingsSidebar[0]!.items }]
    : priceBookSidebar;
  return (
    <ModuleLayout title="Price book" sections={sections}>
      {children}
    </ModuleLayout>
  );
}
