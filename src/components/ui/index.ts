/**
 * Barrel export for UI primitives. Import as `@/components/ui`.
 *
 * Only Button, Card and Badge exist so far — enough to prove out the
 * token-driven pattern. The remaining primitives documented in
 * docs/DESIGN_SYSTEM.md (Input, Textarea, Select, Checkbox, Radio,
 * Dialog, Tabs, Progress, Toast, Tooltip, FileUpload, Stepper,
 * Skeleton, EmptyState, ErrorState) are intentionally not
 * implemented yet — add them when a real screen needs them, in
 * this same directory, following the same variant/size/token
 * conventions as Button.
 */
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from "./Button";
export { Card } from "./Card";
export { Badge, type BadgeProps, type BadgeTone } from "./Badge";
