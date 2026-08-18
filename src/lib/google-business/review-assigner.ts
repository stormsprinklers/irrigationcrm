import { GbpReviewAssignStatus, UserRole, VisitStatus } from "@prisma/client";
import { endOfDay, startOfDay, subDays } from "date-fns";
import type { GbpReviewDto } from "@/lib/google-business/engagement-types";
import {
  commentMentionsName,
  ensureCompanyReviewAliases,
  REVIEW_ALIAS_ROLES,
  tokenizeName,
} from "@/lib/google-business/review-aliases";
import { listGbpReviews } from "@/lib/google-business/v4-api";
import { prisma } from "@/lib/prisma";

const REVIEW_FETCH_MAX_PAGES = 8;

type FieldTech = {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  reviewNameAliases: string[];
};

function reviewerMatchesCustomer(reviewerName: string, customerName: string) {
  const reviewer = tokenizeName(reviewerName);
  const customer = tokenizeName(customerName);
  if (!reviewer.length || !customer.length) return false;

  if (reviewer.join(" ") === customer.join(" ")) return true;
  if (reviewer.length < 2 || customer.length < 2) {
    return reviewer[0] === customer[0] && reviewer.length === 1 && customer.length === 1;
  }

  const rFirst = reviewer[0];
  const rLast = reviewer[reviewer.length - 1];
  const cFirst = customer[0];
  const cLast = customer[customer.length - 1];

  if (rFirst === cFirst && rLast === cLast) return true;
  if (rFirst.length === 1 && rFirst === cFirst[0] && rLast === cLast) return true;
  if (cFirst.length === 1 && cFirst === rFirst[0] && rLast === cLast) return true;
  if (rLast.length === 1 && rFirst === cFirst && rLast === cLast[0]) return true;
  return false;
}

function mentionedTechs(comment: string | null, techs: FieldTech[]) {
  if (!comment?.trim()) return [] as FieldTech[];
  const hits: FieldTech[] = [];
  for (const tech of techs) {
    const names = [tech.firstName, ...tech.reviewNameAliases].filter(Boolean);
    const last = tech.lastName.trim();
    const uniqueLast =
      last && techs.filter((other) => other.lastName.trim().toLowerCase() === last.toLowerCase()).length === 1;
    if (uniqueLast) names.push(last);

    if (names.some((name) => commentMentionsName(comment, name))) {
      hits.push(tech);
    }
  }
  return hits;
}

async function visitTechIds(companyId: string, visits: Array<{
  assignedUserId: string | null;
  crewId: string | null;
  timeEvents: Array<{ userId: string }>;
}>) {
  const ids = new Set<string>();
  const crewIds = [...new Set(visits.map((visit) => visit.crewId).filter(Boolean))] as string[];
  const crews = crewIds.length
    ? await prisma.crew.findMany({
        where: { companyId, id: { in: crewIds } },
        select: { id: true, members: { select: { userId: true } } },
      })
    : [];
  const membersByCrew = new Map(crews.map((crew) => [crew.id, crew.members.map((m) => m.userId)]));

  for (const visit of visits) {
    if (visit.assignedUserId) ids.add(visit.assignedUserId);
    if (visit.crewId) {
      for (const userId of membersByCrew.get(visit.crewId) ?? []) ids.add(userId);
    }
    for (const event of visit.timeEvents) ids.add(event.userId);
  }
  return ids;
}

async function applyAssignments(
  reviewRowId: string,
  userIds: string[],
  customerId: string | null,
  manual: boolean
) {
  const unique = [...new Set(userIds)];
  const share = unique.length ? 1 / unique.length : 0;

  await prisma.$transaction(async (tx) => {
    await tx.gbpReviewAssignment.deleteMany({ where: { reviewId: reviewRowId } });
    if (unique.length) {
      await tx.gbpReviewAssignment.createMany({
        data: unique.map((userId) => ({
          reviewId: reviewRowId,
          userId,
          share,
        })),
      });
    }
    await tx.gbpReview.update({
      where: { id: reviewRowId },
      data: {
        status: unique.length ? GbpReviewAssignStatus.ASSIGNED : GbpReviewAssignStatus.NEEDS_REVIEW,
        customerId,
        assignedManually: manual,
      },
    });
  });
}

async function assignStoredReview(
  companyId: string,
  review: {
    id: string;
    reviewerName: string;
    comment: string | null;
    createTime: Date | null;
    assignedManually: boolean;
    status: GbpReviewAssignStatus;
  },
  techs: FieldTech[]
) {
  if (review.assignedManually) return;

  const mentioned = mentionedTechs(review.comment, techs);
  if (mentioned.length) {
    await applyAssignments(
      review.id,
      mentioned.map((tech) => tech.id),
      null,
      false
    );
    return;
  }

  const reviewDay = review.createTime ?? new Date();
  const windowStart = startOfDay(subDays(reviewDay, 7));
  const windowEnd = endOfDay(reviewDay);

  const visits = await prisma.visit.findMany({
    where: {
      companyId,
      startAt: { gte: windowStart, lte: windowEnd },
      status: { not: VisitStatus.CANCELLED },
      customerId: { not: null },
    },
    select: {
      assignedUserId: true,
      crewId: true,
      customerId: true,
      customer: { select: { id: true, name: true } },
      timeEvents: { select: { userId: true } },
    },
  });

  const matchingCustomerIds = [
    ...new Set(
      visits
        .filter((visit) => visit.customer && reviewerMatchesCustomer(review.reviewerName, visit.customer.name))
        .map((visit) => visit.customerId as string)
    ),
  ];

  if (matchingCustomerIds.length !== 1) {
    await applyAssignments(review.id, [], null, false);
    return;
  }

  const customerId = matchingCustomerIds[0];
  const customerVisits = visits.filter((visit) => visit.customerId === customerId);
  const techIdSet = await visitTechIds(companyId, customerVisits);
  const fieldIds = techs.filter((tech) => techIdSet.has(tech.id)).map((tech) => tech.id);

  await applyAssignments(review.id, fieldIds, customerId, false);
}

export async function upsertGbpReviews(companyId: string, reviews: GbpReviewDto[]) {
  for (const review of reviews) {
    if (!review.reviewId) continue;
    const hasReply = Boolean(review.reply?.trim());
    const createTime = review.createTime ? new Date(review.createTime) : null;
    await prisma.gbpReview.upsert({
      where: { companyId_reviewId: { companyId, reviewId: review.reviewId } },
      create: {
        companyId,
        reviewId: review.reviewId,
        reviewerName: review.reviewerName,
        comment: review.comment,
        starRating: review.starRating,
        createTime: createTime && !Number.isNaN(createTime.getTime()) ? createTime : null,
        hasReply,
      },
      update: {
        reviewerName: review.reviewerName,
        comment: review.comment,
        starRating: review.starRating,
        hasReply,
        ...(createTime && !Number.isNaN(createTime.getTime()) ? { createTime } : {}),
      },
    });
  }
}

export async function assignPendingGbpReviews(companyId: string) {
  await ensureCompanyReviewAliases(companyId);

  const techs = await prisma.user.findMany({
    where: { companyId, status: "ACTIVE", role: { in: REVIEW_ALIAS_ROLES } },
    select: { id: true, firstName: true, lastName: true, name: true, reviewNameAliases: true },
  });

  const pending = await prisma.gbpReview.findMany({
    where: {
      companyId,
      assignedManually: false,
      OR: [{ status: GbpReviewAssignStatus.NEEDS_REVIEW }, { assignments: { none: {} } }],
    },
  });

  for (const review of pending) {
    await assignStoredReview(companyId, review, techs);
  }
}

export async function syncAndAssignGbpReviews(companyId: string, options?: { maxPages?: number }) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      googleBusinessAccountId: true,
      googleBusinessLocationId: true,
      googleBusinessRefreshToken: true,
    },
  });
  if (
    !company?.googleBusinessRefreshToken ||
    !company.googleBusinessAccountId ||
    !company.googleBusinessLocationId
  ) {
    return { upserted: 0 };
  }

  const reviews: GbpReviewDto[] = [];
  let pageToken: string | undefined;
  const maxPages = options?.maxPages ?? REVIEW_FETCH_MAX_PAGES;
  for (let page = 0; page < maxPages; page += 1) {
    const data = await listGbpReviews(
      companyId,
      company.googleBusinessAccountId,
      company.googleBusinessLocationId,
      pageToken
    );
    reviews.push(...data.reviews);
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  await upsertGbpReviews(companyId, reviews);
  await assignPendingGbpReviews(companyId);
  return { upserted: reviews.length };
}

export async function manuallyAssignGbpReview(
  companyId: string,
  reviewId: string,
  userIds: string[]
) {
  const review = await prisma.gbpReview.findFirst({
    where: { id: reviewId, companyId },
    select: { id: true },
  });
  if (!review) return null;

  const techs = await prisma.user.findMany({
    where: {
      companyId,
      id: { in: userIds },
      role: { in: REVIEW_ALIAS_ROLES },
    },
    select: { id: true },
  });
  await applyAssignments(
    review.id,
    techs.map((tech) => tech.id),
    null,
    true
  );
  return prisma.gbpReview.findUnique({
    where: { id: review.id },
    include: {
      assignments: { include: { user: { select: { id: true, name: true } } } },
    },
  });
}

export function isFieldReviewRole(role: string) {
  return role === UserRole.TECH || role === UserRole.INSTALLER;
}
