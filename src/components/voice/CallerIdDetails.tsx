"use client";

import type { CallerInfo } from "@/lib/voice/caller-info";
import { formatCallerIdSubtitle } from "@/lib/voice/caller-info";

export function CallerIdDetails({
  callerInfo,
  className = "text-sm text-muted-foreground",
}: {
  callerInfo: CallerInfo | null | undefined;
  className?: string;
}) {
  if (!callerInfo?.customerId) return null;

  const subtitle = formatCallerIdSubtitle(callerInfo);
  if (!subtitle) return null;

  return <p className={className}>{subtitle}</p>;
}
