import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { absolutePublicBlobUrl, blobProxyUrl } from "@/lib/blob/urls";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { companySettingsSelect } from "@/lib/company/types";
import { prisma } from "@/lib/prisma";

const MAX_SIZE = 256 * 1024;

function looksLikePem(text: string) {
  return /-----BEGIN (CERTIFICATE|TRUSTED CERTIFICATE|PKCS7)-----/.test(text);
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return forbiddenResponse();
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return badRequestResponse("File is required");
    }

    if (file.size > MAX_SIZE) {
      return badRequestResponse("Certificate file must be under 256KB.");
    }

    const text = await file.text();
    if (!looksLikePem(text)) {
      return badRequestResponse("Upload a PEM certificate chain (.pem) from your VMC or CMC issuer.");
    }

    const blob = await uploadPrivateBlob(
      `company-bimi/${user.companyId}/${Date.now()}-bimi-certificate.pem`,
      text,
      { contentType: "application/pem-certificate-chain" }
    );

    const company = await prisma.company.update({
      where: { id: user.companyId },
      data: { bimiCertificateUrl: blob.url },
      select: companySettingsSelect,
    });

    return NextResponse.json({
      url: blob.url,
      displayUrl: blobProxyUrl(blob.url),
      publicUrl: absolutePublicBlobUrl(blob.url),
      company,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Company BIMI certificate upload failed:", error);
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return forbiddenResponse();
    }

    const company = await prisma.company.update({
      where: { id: user.companyId },
      data: { bimiCertificateUrl: null },
      select: companySettingsSelect,
    });

    return NextResponse.json({ company });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to remove BIMI certificate" }, { status: 500 });
  }
}
