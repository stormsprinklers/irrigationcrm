/** Company expense cards are deprecated. Funding/top-up is a no-op. */

export type AutoTopUpCompany = {
  id: string;
  name: string;
};

export type AutoTopUpResult = {
  companyId: string;
  action: "skipped";
  reason: string;
};

export async function runExpenseCardAutoTopUpForCompany(
  company: AutoTopUpCompany
): Promise<AutoTopUpResult> {
  return { companyId: company.id, action: "skipped", reason: "deprecated" };
}

export async function runExpenseCardAutoTopUps(): Promise<AutoTopUpResult[]> {
  return [];
}
