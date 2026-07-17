/** Per-file access granted via Google Picker (drive.file scope). */
export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export type GoogleDriveConnectionStatus = {
  configured: boolean;
  connected: boolean;
  connectedAt: string | null;
  pickerConfigured: boolean;
  oauthEnv: {
    hasClientId: boolean;
    hasClientSecret: boolean;
    hasPickerApiKey: boolean;
  };
};

export type GoogleDriveFileDto = {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string | null;
  webViewLink: string | null;
};
