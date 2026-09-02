import type { SessionUser } from "@/lib/api-auth";
import {
  listOperatedCompanyIds,
  listOperatedVoiceAccounts,
} from "@/lib/account/operated-accounts";
import { prisma } from "@/lib/prisma";
import {
  resolveCallSessionBySids,
  type ResolvedCallSession,
} from "@/lib/voice/resolve-session";

export async function getOperatedCallSession(user: SessionUser, sessionId: string) {
  const accounts = await listOperatedVoiceAccounts(user);
  const companyIds = accounts.map((a) => a.companyId);
  const session = await prisma.callSession.findFirst({
    where: { id: sessionId, companyId: { in: companyIds } },
  });
  if (!session) return null;
  const operator = accounts.find((a) => a.companyId === session.companyId);
  return {
    session,
    operatorUserId: operator?.userId ?? user.id,
  };
}

export async function resolveCallSessionForOperator(
  user: SessionUser,
  callSid: string | null | undefined,
  parentCallSid?: string | null
): Promise<(ResolvedCallSession & { companyId: string; operatorUserId: string }) | null> {
  const accounts = await listOperatedVoiceAccounts(user);
  for (const account of accounts) {
    const session = await resolveCallSessionBySids(account.companyId, callSid, parentCallSid);
    if (!session) continue;
    return {
      ...session,
      companyId: account.companyId,
      operatorUserId: account.userId,
    };
  }
  return null;
}

export async function userOperatesCompany(user: SessionUser, companyId: string) {
  const ids = await listOperatedCompanyIds(user);
  return ids.includes(companyId);
}
