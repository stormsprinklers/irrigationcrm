import type { Prisma } from "@prisma/client";
import { phoneDigitsKey } from "@/lib/inbox/phone";

export function buildCallHistorySearchWhere(rawSearch: string | null | undefined) {
  const search = rawSearch?.trim().slice(0, 100) ?? "";
  if (!search) return undefined;

  const phoneDigits = phoneDigitsKey(search);
  return {
    OR: [
      { fromNumber: { contains: search, mode: "insensitive" } },
      { toNumber: { contains: search, mode: "insensitive" } },
      { customer: { name: { contains: search, mode: "insensitive" } } },
      { customer: { email: { contains: search, mode: "insensitive" } } },
      { customer: { phone: { contains: search, mode: "insensitive" } } },
      { user: { name: { contains: search, mode: "insensitive" } } },
      { handledBy: { name: { contains: search, mode: "insensitive" } } },
      ...(phoneDigits && phoneDigits !== search
        ? [
            { fromNumber: { contains: phoneDigits } },
            { toNumber: { contains: phoneDigits } },
            { customer: { phone: { contains: phoneDigits } } },
          ]
        : []),
    ],
  } satisfies Prisma.CallLogWhereInput;
}
