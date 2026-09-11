import { expenseCardsGoneResponse } from "@/lib/expense-cards/deprecated";

export function GET() {
  return expenseCardsGoneResponse();
}

export const POST = GET;
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
