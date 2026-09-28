import { Badge, Button, Card } from "@/components/ui";

/**
 * Placeholder landing page.
 *
 * This intentionally replaces the create-next-app starter content —
 * it is NOT the final public homepage. It exists only to prove the
 * design tokens and UI primitives render correctly end to end.
 *
 * The real Hero / Services / How It Works / Portfolio / About / FAQ
 * / CTA / Footer sections (docs/PROJECT_SPEC.md section 3.A) are
 * out of scope for this agent.
 */
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-[var(--space-section-x)] py-[var(--space-section-y)] text-center">
      <Badge tone="accent">Foundation build — Agent 1</Badge>

      <h1 className="max-w-2xl text-[length:var(--text-display)] font-semibold tracking-tight text-foreground">
        Have an idea? We build it.
      </h1>

      <p className="max-w-xl text-[length:var(--text-body-lg)] text-foreground-muted">
        Websites, web apps, bots and custom software — requested, scoped and
        delivered through one platform.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button variant="primary" size="lg">
          Start a Project
        </Button>
        <Button variant="outline" size="lg">
          How it works
        </Button>
      </div>

      <Card className="mt-8 max-w-md p-6 text-left text-[length:var(--text-body-sm)] text-foreground-muted">
        This page is a design-token smoke test, not the final homepage.
        See <code className="text-foreground">docs/PROJECT_SPEC.md</code> for
        the public website concept and <code className="text-foreground">agent.md</code>{" "}
        for what the next agent should build here.
      </Card>
    </main>
  );
}
