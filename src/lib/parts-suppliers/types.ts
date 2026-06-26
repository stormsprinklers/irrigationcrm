export type SupplierHoursPeriod = {
  open: { day: number; hour: number; minute: number };
  close?: { day: number; hour: number; minute: number };
};

export type SupplierHoursJson = {
  openNow?: boolean;
  periods?: SupplierHoursPeriod[];
  weekdayDescriptions?: string[];
};

export type PlaceSearchResult = {
  googlePlaceId: string;
  name: string;
  formattedAddress: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  hours: SupplierHoursJson | null;
  weekdayHours: string[];
};

export type PartsSupplierRecord = {
  id: string;
  name: string;
  googlePlaceId: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  hoursJson: SupplierHoursJson | null;
  weekdayHours: string[];
  timezone: string | null;
  isActive: boolean;
};

export type PartsRunOption = {
  supplierId: string;
  name: string;
  address: string;
  phone: string | null;
  weekdayHours: string[];
  isOpenNow: boolean;
  driveMinutes: number | null;
  driveDistanceMiles: number | null;
  mapsUrl: string;
};
