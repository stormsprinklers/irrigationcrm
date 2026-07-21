export type {
  AddressParity,
  AddressRestrictionSummary,
  CalculatePropertyRuntimeParams,
  ControllerProgram,
  ControllerProgramGuide,
  CycleSoakPlan,
  DayOfWeekCode,
  EstablishmentStage,
  GrassSeason,
  ProgramId,
  ProgramZoneEntry,
  PropertyLocationContext,
  PropertyScheduleSettings,
  RuntimeBreakdown,
  ScheduleMode,
  SundayPolicy,
  WeatherInput,
  ZoneRuntimeInput,
  ZoneRuntimeResult,
} from "./types";

export {
  calculateWeeklyRuntimeMinutes,
  calculateZoneRuntime,
  calculateAllZoneRuntimes,
} from "./engine/calculate-zone-runtime";

export {
  speciesFactor,
  densityFactor,
  microclimateFactor,
  landscapeCoefficient,
  daysPerWeekForVegetation,
  DROUGHT_DAYS,
  DEFAULT_DAYS_BY_VEGETATION,
  SPECIES_FACTOR_DEFAULTS,
} from "./coefficients/landscape-k";

export {
  effectiveRainSimple,
  effectiveRainForLandscape,
} from "./eto/effective-rain";

export {
  fetchWeeklyWeather,
  defaultWeatherFallback,
  UTAH_DEFAULT_WEEKLY_ETO,
} from "./eto/open-meteo";

export {
  duFromEfficiencyScore,
  resolveDistributionUniformity,
  calculatePrecipitationRate,
  resolveZoneGpm,
} from "./hydraulics/precipitation-rate";

export { gallonsPerWeek, gallonsPerEvent } from "./hydraulics/gallons";

export {
  NOZZLE_CATALOG,
  getCatalogEntry,
  defaultGpmPerHead,
  defaultPrecipRate,
  defaultDU,
} from "./manufacturer/nozzle-catalog";

export {
  calculateCycleSoak,
  establishmentCycleSoak,
} from "./programs/cycle-soak";

export {
  buildControllerGuide,
  buildProgramTimeline,
  formatTimeOfDay,
  parseTimeOfDay,
  roundUpToTenMinutes,
  WATERING_WINDOW,
} from "./programs/build-controller-guide";

export { zoneInputFromMapZone, propertySettingsFromRecord, propertyLocationFromRecord } from "./adapters";

export {
  parseStreetNumber,
  addressParityFromNumber,
  addressParityFromAddress,
} from "./restrictions/address-parity";

export {
  CITY_WATERING_RULES,
  lookupCityWateringRule,
  resolveCityAddressSchedule,
  pickDaysFromAssigned,
  scheduleModeLabel,
} from "./restrictions/city-watering-rules";
