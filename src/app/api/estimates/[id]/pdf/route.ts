import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { buildEstimateOptionPdfs } from "@/lib/pdf/customer-documents";
export async function GET(request: NextRequest, {params}: {params:Promise<{id:string}>}) {
  try {
    const user = await requireSessionUser(request);
    const {id} = await params;
    const pdfs = await buildEstimateOptionPdfs(id,user.companyId);
    const index = Math.max(0, Number(request.nextUrl.searchParams.get("option") ?? 0));
    const pdf = pdfs[index];
    if (!pdf) return NextResponse.json({error:"PDF not found"},{status:404});
    return new NextResponse(new Uint8Array(pdf.buffer),{headers:{"Content-Type":"application/pdf","Content-Disposition":`inline; filename="${pdf.filename}"`,"Cache-Control":"private, no-store"}});
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    console.error("Estimate PDF failed", error);
    return NextResponse.json({error:"Could not load estimate PDF"},{status:500});
  }
}
