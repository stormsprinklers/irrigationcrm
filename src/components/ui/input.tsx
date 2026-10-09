import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, value, onChange, onBlur, ...props }, ref) => {
    // A controlled number input often has a numeric fallback in its parent
    // (`Number(value) || 0`). Preserve the user's intentionally empty draft
    // until blur instead of immediately replacing it with that fallback.
    const [numberDraftIsEmpty, setNumberDraftIsEmpty] = React.useState(false);
    const controlledNumber = type === "number" && value !== undefined;

    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        value={controlledNumber && numberDraftIsEmpty ? "" : value}
        onChange={(event) => {
          if (controlledNumber) setNumberDraftIsEmpty(event.currentTarget.value === "");
          onChange?.(event);
        }}
        onBlur={(event) => {
          if (controlledNumber) setNumberDraftIsEmpty(false);
          onBlur?.(event);
        }}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
