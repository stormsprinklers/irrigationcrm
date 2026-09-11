import { expenseCardsGoneResponse } from "@/lib/expense-cards/deprecated";

export function GET() {
  return expenseCardsGoneResponse();
}

export const POST = GET;
