export function formatOwnerAssistantAppointment(
  startAt: Date,
  endAt: Date,
  timeZone: string | null | undefined
) {
  const requestedTimeZone = timeZone?.trim() || "America/Denver";
  let resolvedTimeZone = requestedTimeZone;
  let startFormatter: Intl.DateTimeFormat;
  let endFormatter: Intl.DateTimeFormat;

  try {
    startFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: resolvedTimeZone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
    endFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: resolvedTimeZone,
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
    startFormatter.format(startAt);
  } catch {
    resolvedTimeZone = "UTC";
    startFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: resolvedTimeZone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
    endFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: resolvedTimeZone,
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  }

  return {
    companyTimeZone: resolvedTimeZone,
    savedLocalStart: startFormatter.format(startAt),
    savedLocalEnd: endFormatter.format(endAt),
  };
}
