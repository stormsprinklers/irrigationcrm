"use client";

import type { GbpJobPhotoDto } from "@/lib/google-business/engagement-types";

type PickerDoc = {
  id: string;
  name?: string;
  mimeType?: string;
  url?: string;
};

type PickerCallbackData = {
  action: string;
  docs?: PickerDoc[];
};

type PickerTokenResponse = {
  accessToken: string;
  apiKey: string;
  clientId?: string;
  appId?: string;
  error?: string;
};

type PickerBuilder = {
  addView: (view: unknown) => PickerBuilder;
  enableFeature: (feature: string) => PickerBuilder;
  setOAuthToken: (token: string) => PickerBuilder;
  setDeveloperKey: (key: string) => PickerBuilder;
  setAppId: (appId: string) => PickerBuilder;
  setCallback: (cb: (data: PickerCallbackData) => void) => PickerBuilder;
  setTitle: (title: string) => PickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
};

declare global {
  interface Window {
    gapi?: {
      load: (name: string, callback: () => void) => void;
    };
    google?: {
      picker: {
        Action: { PICKED: string; CANCEL: string };
        ViewId: { DOCS_IMAGES: string };
        DocsView: new (viewId?: string) => {
          setIncludeFolders: (include: boolean) => unknown;
          setSelectFolderEnabled: (enabled: boolean) => unknown;
          setMimeTypes: (mimeTypes: string) => unknown;
        };
        Feature: { MULTISELECT_ENABLED: string; NAV_HIDDEN: string };
        PickerBuilder: new () => PickerBuilder;
      };
    };
  }
}

let gapiPromise: Promise<void> | null = null;

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function ensureGapiPicker() {
  if (!gapiPromise) {
    gapiPromise = (async () => {
      await loadScript("https://apis.google.com/js/api.js");
      await new Promise<void>((resolve, reject) => {
        if (!window.gapi) {
          reject(new Error("Google API failed to load"));
          return;
        }
        window.gapi.load("picker", () => resolve());
      });
    })();
  }
  await gapiPromise;
}

export async function openGoogleDriveImagePicker(options?: {
  multiSelect?: boolean;
  title?: string;
}): Promise<PickerDoc[]> {
  const tokenRes = await fetch("/api/marketing/google-drive/picker-token");
  const tokenData = (await tokenRes.json()) as PickerTokenResponse;
  if (!tokenRes.ok) {
    throw new Error(tokenData.error ?? "Google Drive picker is not available");
  }

  await ensureGapiPicker();
  if (!window.google?.picker) {
    throw new Error("Google Picker failed to load");
  }

  const pickerNs = window.google.picker;

  return new Promise((resolve) => {
    const view = new pickerNs.DocsView(pickerNs.ViewId.DOCS_IMAGES);
    view.setIncludeFolders(true);
    view.setMimeTypes("image/png,image/jpeg,image/jpg,image/webp,image/gif");

    let builder = new pickerNs.PickerBuilder()
      .addView(view)
      .setOAuthToken(tokenData.accessToken)
      .setDeveloperKey(tokenData.apiKey)
      .setTitle(options?.title ?? "Select images from Google Drive")
      .setCallback((data: PickerCallbackData) => {
        if (data.action === pickerNs.Action.CANCEL) {
          resolve([]);
          return;
        }
        if (data.action === pickerNs.Action.PICKED) {
          resolve(data.docs ?? []);
        }
      });

    if (options?.multiSelect !== false) {
      builder = builder.enableFeature(pickerNs.Feature.MULTISELECT_ENABLED);
    }
    if (tokenData.appId) {
      builder = builder.setAppId(tokenData.appId);
    }

    builder.build().setVisible(true);
  });
}

export async function importDrivePickerDocs(
  docs: PickerDoc[],
  options?: { copyToBlob?: boolean }
): Promise<{
  photos: GbpJobPhotoDto[];
  media: Array<{ blobUrl: string; fileName: string; mimeType: string }>;
}> {
  if (docs.length === 0) {
    return { photos: [], media: [] };
  }

  const res = await fetch("/api/marketing/google-drive/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileIds: docs.map((doc) => doc.id),
      copyToBlob: options?.copyToBlob ?? false,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "Failed to import Drive files");
  }

  return {
    photos: data.photos ?? [],
    media: data.media ?? [],
  };
}
