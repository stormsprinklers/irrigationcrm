import { ROLE_LABELS } from "@/lib/employees";

/** Roles an admin can preview for training / permission testing. */
export const ROLE_PREVIEW_OPTIONS = ["MANAGER", "CSR", "TECH"] as const;

export type RolePreviewOption = (typeof ROLE_PREVIEW_OPTIONS)[number];

export type RolePreviewUser = {
  role: string;
  trueRole?: string | null;
};

export function isRolePreviewOption(role: string): role is RolePreviewOption {
  return (ROLE_PREVIEW_OPTIONS as readonly string[]).includes(role);
}

/** Actual DB role — ADMIN when previewing, otherwise same as effective role. */
export function trueRoleOf(user: RolePreviewUser): string {
  return user.trueRole?.trim() || user.role;
}

export function isRolePreviewActive(user: RolePreviewUser): boolean {
  return Boolean(user.trueRole && user.trueRole !== user.role);
}

/** Only real admins (including while previewing another role) may use preview mode. */
export function canUseRolePreview(user: RolePreviewUser): boolean {
  return trueRoleOf(user) === "ADMIN";
}

export function rolePreviewLabel(role: string): string {
  return ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role;
}
