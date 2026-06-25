import { deprecatedGa4JsonResponse } from "@/lib/google-analytics/deprecated";

/** @deprecated */
export async function GET() {
  return deprecatedGa4JsonResponse();
}
