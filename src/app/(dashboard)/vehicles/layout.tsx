import { redirect } from "next/navigation";
import { vehiclesSidebar } from "@/config/navigation";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import { auth } from "@/lib/auth";
import { canViewVehicles } from "@/lib/vehicles/permissions";

export default async function VehiclesLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!canViewVehicles(session?.user?.role)) {
    redirect("/home");
  }

  return (
    <ModuleLayout title="Vehicles" sections={vehiclesSidebar}>
      {children}
    </ModuleLayout>
  );
}
