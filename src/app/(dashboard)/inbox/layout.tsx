import { inboxSidebar } from "@/config/navigation";
import { ModuleSidebar } from "@/components/layout/ModuleSidebar";

export default function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-[calc(100dvh-4.5rem-4rem)] w-full overflow-hidden xl:h-[calc(100dvh-4.5rem)]">
      <ModuleSidebar title="Inbox" sections={inboxSidebar} />
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
