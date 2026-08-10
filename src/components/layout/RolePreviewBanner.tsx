"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Eye, Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { applyRolePreview } from "@/lib/role-preview-client";
import {
  canUseRolePreview,
  isRolePreviewActive,
  ROLE_PREVIEW_OPTIONS,
  rolePreviewLabel,
} from "@/lib/role-preview";

export function RolePreviewBanner() {
  const { data: session, update, status } = useSession();
  const [busy, setBusy] = useState(false);

  if (status !== "authenticated" || !session?.user) return null;
  if (!canUseRolePreview(session.user) || !isRolePreviewActive(session.user)) return null;

  const previewRole = session.user.role;

  async function exitPreview() {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await applyRolePreview(null, update);
      if (ok) window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 bg-amber-600 px-4 py-2 text-center text-sm font-medium text-white">
      <span className="inline-flex items-center gap-2">
        <Eye className="h-4 w-4 shrink-0" aria-hidden />
        Previewing as {rolePreviewLabel(previewRole)} — permissions match that role
      </span>
      <span className="inline-flex flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 bg-white text-amber-900 hover:bg-amber-50"
          disabled={busy}
          onClick={() => void exitPreview()}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Exit to Admin"}
        </Button>
        <Link
          href="/settings/role-preview"
          className="text-white underline underline-offset-2 hover:text-amber-50"
        >
          Switch role
        </Link>
      </span>
    </div>
  );
}

/** Compact role chips for the settings page / banner extras. */
export function RolePreviewQuickSwitch({
  className,
}: {
  className?: string;
}) {
  const { data: session, update } = useSession();
  const [busy, setBusy] = useState<string | null>(null);

  if (!session?.user || !canUseRolePreview(session.user)) return null;

  const user = session.user;

  async function switchTo(role: (typeof ROLE_PREVIEW_OPTIONS)[number] | null) {
    if (busy) return;
    setBusy(role ?? "ADMIN");
    try {
      const ok = await applyRolePreview(role, update);
      if (ok) window.location.reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={!isRolePreviewActive(user) ? "default" : "outline"}
          disabled={Boolean(busy)}
          onClick={() => void switchTo(null)}
        >
          {busy === "ADMIN" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Admin
        </Button>
        {ROLE_PREVIEW_OPTIONS.map((role) => (
          <Button
            key={role}
            type="button"
            size="sm"
            variant={user.role === role ? "default" : "outline"}
            disabled={Boolean(busy)}
            onClick={() => void switchTo(role)}
          >
            {busy === role ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {rolePreviewLabel(role)}
          </Button>
        ))}
      </div>
    </div>
  );
}
