export type RachioPersonInfo = {
  id: string;
};

export type RachioZone = {
  id: string;
  name: string;
  zoneNumber?: number;
  enabled?: boolean;
  runtime?: number;
  lastWateredDate?: number | null;
  imageUrl?: string | null;
};

export type RachioScheduleRuleZone = {
  zoneId: string;
  duration: number;
  sortOrder?: number;
};

export type RachioScheduleRule = {
  id: string;
  name: string;
  enabled?: boolean;
  totalDuration?: number;
  zones?: RachioScheduleRuleZone[];
  externalName?: string | null;
  startDate?: number;
  endDate?: number;
};

export type RachioFlexScheduleRule = {
  id: string;
  name?: string;
  enabled?: boolean;
};

export type RachioDevice = {
  id: string;
  name: string;
  serialNumber?: string;
  model?: string;
  status?: string;
  on?: boolean;
  zones?: RachioZone[];
  scheduleRules?: RachioScheduleRule[];
  flexScheduleRules?: RachioFlexScheduleRule[];
  latitude?: number;
  longitude?: number;
};

export type RachioPerson = {
  id: string;
  email?: string;
  username?: string;
  fullName?: string;
  devices?: RachioDevice[];
};

export type RachioDeviceSummary = {
  id: string;
  name: string;
  serialNumber?: string;
  model?: string;
  status?: string;
  zoneCount?: number;
};

export type RachioDeviceKind = "controller" | "hose_timer";

export type RachioBaseStation = {
  id: string;
  name?: string;
  serialNumber?: string;
  model?: string;
  status?: string;
  reportedState?: string;
  valves?: { id: string; name?: string }[];
};

export type RachioProperty = {
  id?: string;
  name?: string;
  street?: string;
  streetAddress?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zip?: string;
  postalCode?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  entities?: Array<{
    id?: string;
    type?: string;
    deviceId?: string;
    baseStationId?: string;
    locationId?: string;
  }>;
};

export type RachioSuggestedCustomer = {
  customerId: string;
  customerName: string;
  propertyId: string | null;
  propertyName: string | null;
  matchSource: "customer" | "property";
};

export type RachioEvent = {
  id?: string;
  type?: string;
  eventDate?: number;
  duration?: number;
  zoneId?: string;
  zoneName?: string;
  summary?: string;
  subType?: string;
};

export type RachioCurrentSchedule = {
  scheduleRuleId?: string;
  name?: string;
  zones?: RachioScheduleRuleZone[];
  totalDuration?: number;
};

export class RachioApiError extends Error {
  status: number;
  code?: number;

  constructor(message: string, status: number, code?: number) {
    super(message);
    this.name = "RachioApiError";
    this.status = status;
    this.code = code;
  }
}
