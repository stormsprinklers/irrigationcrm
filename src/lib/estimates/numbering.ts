import { prisma } from "@/lib/prisma";

/** Mint the next company estimate number, e.g. EST-1012. */
export async function allocateEstimateNumber(companyId: string): Promise<string> {
  const updated = await prisma.$transaction(async (tx) => {
    const company = await tx.company.update({
      where: { id: companyId },
      data: { estimateNextNumber: { increment: 1 } },
      select: { estimatePrefix: true, estimateNextNumber: true },
    });
    // After increment, the value used for this estimate is nextNumber - 1
    const seq = Math.max(1, company.estimateNextNumber - 1);
    const prefix = (company.estimatePrefix?.trim() || "EST").replace(/-+$/, "");
    return `${prefix}-${seq}`;
  });
  return updated;
}

export function optionLetterForIndex(index: number): string {
  // A..Z then AA, AB, …
  let n = index;
  let letter = "";
  do {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letter;
}

/** Display number: EST-1012 alone, or EST-1012A / EST-1012B when multiple options. */
export function formatEstimateOptionNumber(
  estimateNumber: string | null | undefined,
  letter: string | null | undefined,
  optionCount: number
): string {
  const base = estimateNumber?.trim() || "EST";
  if (optionCount <= 1) return base;
  return `${base}${letter || "A"}`;
}
