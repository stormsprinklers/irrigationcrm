import { uploadPrivateBlob } from "@/lib/blob/storage";

export async function uploadIntegrationAttachment(params: {
  companyId: string;
  folder: string;
  fileName: string;
  mimeType: string;
  base64: string;
}) {
  const buffer = Buffer.from(params.base64, "base64");
  const safeName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathname = `${params.folder}/${params.companyId}/${Date.now()}-${safeName}`;
  const blob = await uploadPrivateBlob(pathname, buffer, { contentType: params.mimeType });
  return blob.url;
}
