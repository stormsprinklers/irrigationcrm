export const IMPORTANT_UPDATE_COLORS = ["AMBER", "ROSE", "SKY", "VIOLET", "EMERALD"] as const;
export type ImportantUpdateColor = (typeof IMPORTANT_UPDATE_COLORS)[number];

export type ImportantUpdateDTO = {
  id: string;
  title: string;
  body: string | null;
  color: ImportantUpdateColor;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  createdByName: string;
};
