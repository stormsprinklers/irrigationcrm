"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const DIAL_PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;

export type DialPadKey = (typeof DIAL_PAD_KEYS)[number];

const SUBLABELS: Partial<Record<DialPadKey, string>> = {
  "2": "ABC",
  "3": "DEF",
  "4": "GHI",
  "5": "JKL",
  "6": "MNO",
  "7": "PQRS",
  "8": "TUV",
  "9": "WXYZ",
  "0": "+",
};

export function isDtmfKey(key: string): key is DialPadKey {
  return (DIAL_PAD_KEYS as readonly string[]).includes(key);
}

export function CallDialPad({
  onDigit,
  compact = false,
  className,
}: {
  onDigit: (digit: DialPadKey) => void;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {DIAL_PAD_KEYS.map((digit) => (
        <Button
          key={digit}
          variant="outline"
          type="button"
          aria-label={`Dial ${digit}`}
          className={cn("flex-col gap-0 font-semibold", compact ? "h-10 text-base" : "h-12 text-lg")}
          onClick={() => onDigit(digit)}
        >
          <span>{digit}</span>
          {SUBLABELS[digit] ? (
            <span className="text-[9px] font-normal tracking-widest text-muted-foreground">
              {SUBLABELS[digit]}
            </span>
          ) : null}
        </Button>
      ))}
    </div>
  );
}
