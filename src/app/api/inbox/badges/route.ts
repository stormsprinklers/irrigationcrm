import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getInboxBadgeCounts } from "@/lib/inbox/badge-counts";
import { listOperatedVoiceAccounts } from "@/lib/account/operated-accounts";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const accounts = await listOperatedVoiceAccounts({
      userId: user.id,
      email: user.email,
      companyId: user.companyId,
    });
    const operatedUsers = await prisma.user.findMany({
      where: { id: { in: accounts.map((account) => account.userId) } },
      select: { id: true, companyId: true, role: true },
    });
    const userById = new Map(operatedUsers.map((accountUser) => [accountUser.id, accountUser]));
    const companyCounts = await Promise.all(
      accounts.map(async (account) => ({
        companyId: account.companyId,
        companyName: account.companyName,
        brandPrimary: account.brandPrimary,
        switchUserId: account.userId,
        counts: await getInboxBadgeCounts(
          account.companyId,
          userById.get(account.userId) ?? undefined
        ),
      }))
    );
    const counts = companyCounts.reduce(
      (total, company) => ({
        sms: total.sms + company.counts.sms,
        social: total.social + company.counts.social,
        leads: total.leads + company.counts.leads,
        missedCalls: total.missedCalls + company.counts.missedCalls,
        googleReviews: total.googleReviews + company.counts.googleReviews,
        total: total.total + company.counts.total,
      }),
      { sms: 0, social: 0, leads: 0, missedCalls: 0, googleReviews: 0, total: 0 }
    );
    return NextResponse.json({ ...counts, companies: companyCounts });
  } catch {
    return unauthorizedResponse();
  }
}
