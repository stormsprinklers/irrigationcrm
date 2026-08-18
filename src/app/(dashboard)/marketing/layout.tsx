import { redirect } from "next/navigation";
import { marketingSidebar } from "@/config/navigation";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import { auth } from "@/lib/auth";
import { canViewMarketing } from "@/lib/settings/access";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!canViewMarketing(session?.user?.role)) {
    redirect("/home");
  }

  return (
    <ModuleLayout title="Marketing" sections={marketingSidebar}>
      {children}
    </ModuleLayout>
  );
}
