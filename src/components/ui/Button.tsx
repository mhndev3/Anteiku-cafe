import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] " +
  "font-medium transition-colors duration-[var(--duration-fast)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
  "disabled:pointer-events-none disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-foreground hover:brightness-110",
  secondary: "bg-surface text-foreground border border-border hover:border-border-strong",
  outline: "border border-border text-foreground hover:bg-surface",
  ghost: "text-foreground hover:bg-surface",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-[length:var(--text-body-sm)]",
  md: "h-11 px-4 text-[length:var(--text-body)]",
  lg: "h-13 px-6 text-[length:var(--text-body-lg)]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
