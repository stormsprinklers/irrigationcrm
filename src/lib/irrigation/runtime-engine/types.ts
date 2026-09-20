import type {
  IrrigationType,
  ShadeLevel,
  SlopeLevel,
  SoilType,
  VegetationType,
} from "../types";

export type GrassSeason = "COOL" | "WARM";
export type EstablishmentStage = "NORMAL" | "NEW_SOD" | "NEW_SEED";
export type ProgramId = "A" | "B" | "C";
export type DayOfWeekCode = "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";
export type AddressParity = "odd" | "even";
export type ScheduleMode = "days_of_week" | "odd_calendar_dates" | "even_calendar_dates";
export type SundayPolicy = "allowed" | "limited" | "prohibited" | "saturday_only";

export type PropertyLocationContext = {
  address?: string | null;
  city?: string | null;
};

export type PropertyScheduleSettings = {
  grassSeason: GrassSeason;
  droughtRestrictionsActive: boolean;
  cycleSoakEnabled: boolean;
  etoOverrideInches?: number | null;
};

/** City + address parity schedule applied when generating controller programs. */
export type AddressRestrictionSummary = {
  city: string;
  parity: AddressParity;
  scheduleMode: ScheduleMode;
  daysOfWeek: DayOfWeekCode[];
  daysLabel: string;
  sundayPolicy: SundayPolicy;
  notes: string[];
};

export type ZoneRuntimeInput = {
  id: string;
  name: string;
  sortOrder: number;
  stationNumber?: number;
  vegetationType: VegetationType | null;
  shadeLevel: ShadeLevel | null;
  slopeLevel: SlopeLevel | null;
  soilType: SoilType | null;
  irrigationType: IrrigationType | null;
  nozzleCount: number | null;
  estimatedGpm: number | null;
  irrigatedSqFt: number | null;
  irrigationEfficiencyScore: number | null;
  establishmentStage: EstablishmentStage;
  nozzleGpm: number | null;
};

export type WeatherInput = {
  weeklyEToInches: number;
  totalRainfallInches: number;
  source: "open_meteo" | "override" | "cache";
};

export type RuntimeBreakdown = {
  weeklyEToInches: number;
  Ks: number;
  Kd: number;
  Kmc: number;
  KL: number;
  landscapeETInches: number;
  effectiveRainInches: number;
  netWaterInches: number;
  precipitationRateInHr: number;
  distributionUniformity: number;
  totalGpm: number;
  prSource: "calculated" | "catalog";
};

export type CycleSoakPlan = {
  enabled: boolean;
  cycleCount: number;
  minutesPerCycle: number;
  soakMinutes: number;
  wallClockMinutes: number;
  description: string;
};

export type ZoneRuntimeResult = {
  zoneId: string;
  name: string;
  stationNumber: number;
  weeklyRuntimeMinutes: number;
  runtimePerEventMinutes: number;
  daysPerWeek: number;
  gallonsPerWeek: number;
  gallonsPerEvent: number;
  cycleSoak: CycleSoakPlan;
  breakdown: RuntimeBreakdown;
  establishmentOverride: boolean;
  establishmentNote?: string;
};

export type ProgramZoneEntry = ZoneRuntimeResult & {
  startTime?: string;
  finishTime?: string;
};

export type ControllerProgram = {
  id: ProgramId;
  label: string;
  daysOfWeek: DayOfWeekCode[];
  daysLabel: string;
  scheduleMode?: ScheduleMode;
  startTimes: string[];
  zones: ProgramZoneEntry[];
  totalWallClockMinutes: number;
  totalGallonsPerWeek: number;
  isEstablishment?: boolean;
};

export type ControllerProgramGuide = {
  generatedAt: string;
  propertyId: string;
  weeklyEToInches: number;
  totalRainfallInches: number;
  effectiveRainInches: number;
  droughtMode: boolean;
  cycleSoakEnabled: boolean;
  grassSeason: GrassSeason;
  weatherSource: WeatherInput["source"];
  programs: ControllerProgram[];
  totalGallonsPerWeek: number;
  notes: string[];
  addressRestriction?: AddressRestrictionSummary | null;
};

export type CalculatePropertyRuntimeParams = {
  propertyId: string;
  settings: PropertyScheduleSettings;
  zones: ZoneRuntimeInput[];
  weather: WeatherInput;
  location?: PropertyLocationContext;
  useManagementEfficiency?: boolean;
};
