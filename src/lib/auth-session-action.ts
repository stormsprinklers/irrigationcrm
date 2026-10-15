import { isRolePreviewOption } from "@/lib/role-preview";

export type AuthSessionAction =
  | { type: "switch-account"; targetUserId: string }
  | { type: "role-preview"; role: string | null };

/**
 * Parse the only client-requested session transitions the server supports.
 * Identity and authorization claims are never copied directly from session.update().
 */
export function parseAuthSessionAction(value: unknown): AuthSessionAction | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { type?: unknown; targetUserId?: unknown; role?: unknown };

  if (candidate.type === "switch-account") {
    const targetUserId =
      typeof candidate.targetUserId === "string" ? candidate.targetUserId.trim() : "";
    return targetUserId ? { type: "switch-account", targetUserId } : null;
  }

  if (candidate.type === "role-preview") {
    if (candidate.role === null || candidate.role === "ADMIN") {
      return { type: "role-preview", role: null };
    }
    if (typeof candidate.role === "string" && isRolePreviewOption(candidate.role)) {
      return { type: "role-preview", role: candidate.role };
    }
  }

  return null;
}
