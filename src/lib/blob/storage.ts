import { put } from "@vercel/blob";

type UploadBody = Blob | File | Buffer | ArrayBuffer | ReadableStream | string;

type UploadOptions = {
  contentType?: string;
  addRandomSuffix?: boolean;
};

export function getBlobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN;
}

export function assertBlobConfigured() {
  if (!getBlobToken()) {
    throw new Error(
      "Blob storage is not configured. Add BLOB_READ_WRITE_TOKEN in Vercel environment variables and redeploy."
    );
  }
}

export async function uploadPrivateBlob(
  pathname: string,
  body: UploadBody,
  options: UploadOptions = {}
) {
  assertBlobConfigured();

  return put(pathname, body, {
    access: "private",
    token: getBlobToken(),
    contentType: options.contentType,
    addRandomSuffix: options.addRandomSuffix ?? false,
  });
}

export async function uploadPublicBlob(
  pathname: string,
  body: UploadBody,
  options: UploadOptions = {}
) {
  // Store is private-access only — use private put. Callers that need a fetchable URL
  // (email clients, Google APIs) must use absolutePublicBlobUrl() /api/public/blob.
  return uploadPrivateBlob(pathname, body, {
    ...options,
    addRandomSuffix: options.addRandomSuffix ?? true,
  });
}
