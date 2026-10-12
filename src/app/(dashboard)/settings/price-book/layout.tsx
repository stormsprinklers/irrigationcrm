import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { canManagePriceBook } from "@/lib/price-book/permissions";

export default async function PriceBookSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!canManagePriceBook(session?.user?.role)) redirect("/price-book");
  return children;
}
