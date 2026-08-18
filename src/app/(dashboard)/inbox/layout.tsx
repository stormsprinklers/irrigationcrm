import { inboxSidebar } from "@/config/navigation";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import { auth } from "@/lib/auth";
import { filterInboxSidebarForUser } from "@/lib/settings/access";

export default async function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const sections = filterInboxSidebarForUser(inboxSidebar, session?.user?.role);

  return (
    <ModuleLayout title="Inbox" sections={sections} scrollable={false}>
      {children}
    </ModuleLayout>
  );
}
