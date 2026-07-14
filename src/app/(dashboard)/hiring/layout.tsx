import { redirect } from "next/navigation";
import { hiringSidebar } from "@/config/navigation";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import { auth } from "@/lib/auth";
import { canAccessHiring } from "@/lib/hiring/permissions";

export default async function HiringLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!canAccessHiring(session?.user?.role)) {
    redirect("/home");
  }

  return (
    <ModuleLayout title="Hiring" sections={hiringSidebar}>
      {children}
    </ModuleLayout>
  );
}
