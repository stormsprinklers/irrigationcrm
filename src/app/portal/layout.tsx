import type { ReactNode } from "react";

/**
 * Customer portal stays light + high-contrast regardless of CRM/system dark mode.
 * Nested pages wrap content in `.portal-shell` which locks CSS variables.
 */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return <div className="portal-root light">{children}</div>;
}
