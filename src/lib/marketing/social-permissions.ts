import { UserRole } from "@prisma/client";

const REVIEW_ROLES = new Set<string>([UserRole.ADMIN, UserRole.MANAGER]);

const SUBMIT_ROLES = new Set<string>([
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.SOCIAL_MEDIA_MANAGER,
]);

const VIEW_ROLES = new Set<string>([
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.SOCIAL_MEDIA_MANAGER,
]);

export function canViewSocialMarketing(role: string) {
  return VIEW_ROLES.has(role);
}

export function canSubmitSocialPosts(role: string) {
  return SUBMIT_ROLES.has(role);
}

export function canReviewSocialPosts(role: string) {
  return REVIEW_ROLES.has(role);
}

/** Admins can publish and schedule without the review queue. */
export function canBypassSocialReview(role: string) {
  return role === UserRole.ADMIN;
}

export function canManageSocialSettings(role: string) {
  return REVIEW_ROLES.has(role);
}
