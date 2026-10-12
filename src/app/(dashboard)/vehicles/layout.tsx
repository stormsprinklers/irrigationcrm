import { redirect } from "next/navigation";
import { vehiclesSidebar } from "@/config/navigation";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import { auth } from "@/lib/auth";
import { canViewVehicles, canManageVehicles } from "@/lib/vehicles/permissions";

export default async function VehiclesLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!canViewVehicles(session?.user?.role)) {
    redirect("/home");
  }
  const sections = canManageVehicles(session?.user?.role) ? vehiclesSidebar : [
    { items: vehiclesSidebar[0]!.items.filter(item => item.href !== "/vehicles/new") },
  ];

  return (
    <ModuleLayout title="Vehicles" sections={sections}>
      {children}
    </ModuleLayout>
  );
}
