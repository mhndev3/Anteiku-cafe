import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Neutral surface container. Intentionally unopinionated about
 * internal layout (no built-in header/body/footer slots yet) —
 * add those only when a real screen needs them, to avoid an
 * over-abstracted primitive nobody uses consistently.
 */
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-[var(--radius-lg)] border border-border bg-surface",
          "shadow-[shadow:var(--shadow-md)]",
          className,
        )}
        {...props}
      />
    );
  },
);

Card.displayName = "Card";
