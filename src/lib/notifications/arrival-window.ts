export function formatArrivalWindow(startAt: Date, windowHours: number): string {
  const endAt = new Date(startAt.getTime() + windowHours * 60 * 60 * 1000);
  const timeFmt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const start = startAt.toLocaleTimeString("en-US", timeFmt);
  const end = endAt.toLocaleTimeString("en-US", timeFmt);
  return `${start} – ${end}`;
}

export function formatVisitDate(startAt: Date): string {
  return startAt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
