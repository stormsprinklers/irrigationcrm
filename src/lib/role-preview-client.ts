"use client";

import { toast } from "sonner";
import type { Session } from "next-auth";
import type { RolePreviewOption } from "@/lib/role-preview";

type PreviewSessionPayload = {
  role: string;
  trueRole: string | null;
};

type SessionUpdate = (data?: unknown) => Promise<Session | null>;

/**
 * Validates with the server, then updates the JWT so the preview role applies app-wide.
 */
export async function applyRolePreview(
  role: RolePreviewOption | "ADMIN" | null,
  update: SessionUpdate
): Promise<boolean> {
  const res = await fetch("/api/settings/role-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    toast.error(typeof data.error === "string" ? data.error : "Could not change role preview");
    return false;
  }

  const session = data.session as PreviewSessionPayload | undefined;
  if (!session?.role) {
    toast.error("Invalid preview response");
    return false;
  }

  await update({
    user: {
      role: session.role,
      trueRole: session.trueRole,
    },
  });

  toast.success(typeof data.message === "string" ? data.message : "Role preview updated");
  return true;
}
