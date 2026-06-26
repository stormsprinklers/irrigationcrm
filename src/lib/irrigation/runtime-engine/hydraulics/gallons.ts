export function gallonsPerWeek(totalGpm: number, weeklyRuntimeMinutes: number): number {
  return Math.round(totalGpm * weeklyRuntimeMinutes * 10) / 10;
}

export function gallonsPerEvent(totalGpm: number, runtimePerEventMinutes: number): number {
  return Math.round(totalGpm * runtimePerEventMinutes * 10) / 10;
}
