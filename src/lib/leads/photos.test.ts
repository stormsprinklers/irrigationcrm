import test from "node:test";
import assert from "node:assert/strict";
import { storedLeadPhotos } from "./photos";
import { canAccessBlobPath } from "../blob/urls";

const companyId = "company-1";
const leadId = "lead-1";

test("returns stored photos scoped to the requested company and lead", () => {
  const photos = storedLeadPhotos(
    {
      photos: [
        {
          name: "house.jpg",
          url: "https://store.public.blob.vercel-storage.com/leads/company-1/lead-1/house.jpg",
          pathname: "leads/company-1/lead-1/house.jpg",
          mimeType: "image/jpeg",
        },
      ],
    },
    { companyId, leadId }
  );

  assert.deepEqual(photos, [
    {
      name: "house.jpg",
      url: "https://store.public.blob.vercel-storage.com/leads/company-1/lead-1/house.jpg",
      pathname: "leads/company-1/lead-1/house.jpg",
      mimeType: "image/jpeg",
    },
  ]);
});

test("rejects external URLs and photos from another lead", () => {
  const photos = storedLeadPhotos(
    {
      photos: [
        { url: "https://example.com/house.jpg", pathname: "leads/company-1/lead-1/house.jpg" },
        {
          url: "https://store.public.blob.vercel-storage.com/leads/company-1/lead-2/house.jpg",
          pathname: "leads/company-1/lead-2/house.jpg",
        },
      ],
    },
    { companyId, leadId }
  );

  assert.deepEqual(photos, []);
});

test("uses the legacy JPEG fallback when old metadata has no MIME type", () => {
  const photos = storedLeadPhotos(
    {
      photos: [
        {
          name: "IMG_2684.HEIC",
          url: "https://store.public.blob.vercel-storage.com/leads/company-1/lead-1/photo",
          pathname: "leads/company-1/lead-1/photo",
        },
      ],
    },
    { companyId, leadId }
  );

  assert.equal(photos[0]?.mimeType, "image/jpeg");
});

test("authenticated blob access allows only the current company's lead folder", () => {
  assert.equal(canAccessBlobPath("company-1", "leads/company-1/lead-1/house.jpg"), true);
  assert.equal(canAccessBlobPath("company-1", "leads/company-2/lead-1/house.jpg"), false);
});
