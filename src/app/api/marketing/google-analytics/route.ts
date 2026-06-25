import { NextRequest } from "next/server";
import { deprecatedGa4JsonResponse } from "@/lib/google-analytics/deprecated";

/** @deprecated Use native website analytics. See lib/google-analytics/DEPRECATED.md */
export async function GET(_request: NextRequest) {
  return deprecatedGa4JsonResponse();
}

/** @deprecated */
export async function DELETE(_request: NextRequest) {
  return deprecatedGa4JsonResponse();
}
