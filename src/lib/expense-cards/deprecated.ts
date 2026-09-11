import { NextResponse } from "next/server";

export const EXPENSE_CARDS_DEPRECATED_MESSAGE =
  "Company expense cards have been deprecated.";

export function expenseCardsGoneResponse() {
  return NextResponse.json(
    { error: EXPENSE_CARDS_DEPRECATED_MESSAGE, deprecated: true },
    { status: 410 }
  );
}
