import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Generic status tone, not a 1:1 mapping of ProjectStatus values.
 * Callers (e.g. a future ProjectStatusBadge) decide which tone a
 * given lifecycle state maps to — keeps this primitive reusable
 * for payments, files, etc. too, not just projects.
 */
export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface text-foreground-muted border-border",
  accent: "bg-accent-soft text-accent border-transparent",
  success: "bg-success/10 text-success border-transparent",
  warning: "bg-warning/10 text-warning border-transparent",
  danger: "bg-danger/10 text-danger border-transparent",
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone = "neutral", ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-[var(--radius-full)] border px-2.5 py-0.5",
          "text-[length:var(--text-caption)] font-medium",
          tones[tone],
          className,
        )}
        {...props}
      />
    );
  },
);

Badge.displayName = "Badge";
