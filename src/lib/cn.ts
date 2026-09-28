/**
 * Minimal className combiner. Deliberately dependency-free for now:
 * filters out falsy values and joins the rest.
 *
 * If class-conflict resolution becomes necessary (e.g. merging
 * `p-2` with a caller-supplied `p-4`), replace this with
 * `clsx` + `tailwind-merge` rather than hand-rolling merge logic —
 * do not grow this function ad hoc.
 */
export type ClassValue = string | number | null | undefined | false;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
