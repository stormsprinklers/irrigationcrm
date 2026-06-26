const OPEN_METEO_URL = "https://archive-api.open-meteo.com/v1/archive";
const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

export type OpenMeteoWeeklyResult = {
  weeklyEToInches: number;
  totalRainfallInches: number;
  dailyETo: number[];
  dailyRain: number[];
  source: "open_meteo";
};

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

/** ET0 from Open-Meteo is in mm; convert to inches. */
function mmToInches(mm: number): number {
  return mm / 25.4;
}

async function fetchOpenMeteoJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new Error(`Open-Meteo request failed: ${res.status}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

/**
 * Fetch last 7 days ET0 and rainfall from Open-Meteo for a property location.
 * Uses archive API for past days; supplements with forecast when needed.
 */
export async function fetchWeeklyWeather(
  latitude: number,
  longitude: number
): Promise<OpenMeteoWeeklyResult> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 6);

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: "et0_fao_evapotranspiration,precipitation_sum",
    timezone: "America/Denver",
    start_date: formatDate(start),
    end_date: formatDate(end),
  });

  let data: Record<string, unknown>;
  try {
    data = await fetchOpenMeteoJson(`${OPEN_METEO_URL}?${params}`);
  } catch {
    const forecastParams = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      daily: "et0_fao_evapotranspiration,precipitation_sum",
      timezone: "America/Denver",
      past_days: "7",
      forecast_days: "0",
    });
    data = await fetchOpenMeteoJson(`${OPEN_METEO_FORECAST_URL}?${forecastParams}`);
  }

  const daily = data.daily as Record<string, number[]> | undefined;
  const et0Mm = daily?.et0_fao_evapotranspiration ?? [];
  const rainMm = daily?.precipitation_sum ?? [];

  const dailyETo = et0Mm.map((v) => Math.round(mmToInches(v ?? 0) * 1000) / 1000);
  const dailyRain = rainMm.map((v) => Math.round(mmToInches(v ?? 0) * 1000) / 1000);

  const weeklyEToInches = Math.round(sum(dailyETo) * 1000) / 1000;
  const totalRainfallInches = Math.round(sum(dailyRain) * 1000) / 1000;

  return {
    weeklyEToInches: weeklyEToInches > 0 ? weeklyEToInches : 1.8,
    totalRainfallInches,
    dailyETo,
    dailyRain,
    source: "open_meteo",
  };
}

/** Utah summer fallback when coordinates unavailable */
export const UTAH_DEFAULT_WEEKLY_ETO = 1.8;

export function defaultWeatherFallback(): OpenMeteoWeeklyResult {
  return {
    weeklyEToInches: UTAH_DEFAULT_WEEKLY_ETO,
    totalRainfallInches: 0,
    dailyETo: [0.26, 0.26, 0.26, 0.26, 0.26, 0.26, 0.24],
    dailyRain: [0, 0, 0, 0, 0, 0, 0],
    source: "open_meteo",
  };
}
