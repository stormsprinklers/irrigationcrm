import { NextRequest } from "next/server";
import { handleDialComplete } from "@/lib/voice/dial-complete";

export async function POST(request: NextRequest) {
  return handleDialComplete(request);
}
