import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canViewMaintenancePlans } from "@/lib/maintenance-plans/permissions";
import type { UserRole } from "@prisma/client";

export default async function MaintenancePlansLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const role = session?.user?.role as UserRole | undefined;
  if (!role || !canViewMaintenancePlans(role)) {
    redirect("/home");
  }
  return children;
}
