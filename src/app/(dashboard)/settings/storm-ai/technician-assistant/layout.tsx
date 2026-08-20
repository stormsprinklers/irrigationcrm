"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/storm-ai/technician-assistant", label: "Issues", exact: true },
  { href: "/settings/storm-ai/technician-assistant/parts", label: "Parts Info", exact: false },
] as const;

function isIssueEditorRoute(pathname: string) {
  return (
    pathname.startsWith("/settings/storm-ai/technician-assistant/") &&
    !pathname.startsWith("/settings/storm-ai/technician-assistant/parts")
  );
}

export default function TechnicianAssistantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isIssueEditor = isIssueEditorRoute(pathname);

  return (
    <div
      className={cn(isIssueEditor && "flex h-full min-h-0 flex-col overflow-hidden")}
    >
      {/* Issue editor owns its own top toolbar (title / undo / save). */}
      {!isIssueEditor ? (
        <div className="mb-6 flex shrink-0 gap-1 border-b border-border">
          {TABS.map((tab) => {
            const active = tab.exact
              ? pathname === tab.href
              : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      ) : null}
      <div className={cn(isIssueEditor && "min-h-0 flex-1")}>{children}</div>
    </div>
  );
}
