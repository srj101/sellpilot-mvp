import { AuthShell } from "~/app/_components/auth/auth-shell";
import { DemoForm } from "./_components/demo-form";

export default function DemoPage() {
  return (
    <AuthShell
      eyebrow="Talk to sales"
      title="See SellPilot in action"
      description="Schedule a 1-on-1 walkthrough — we'll show you how the AI agent handles conversations, orders, and payments end to end."
      topRightHref="/login"
      topRightLabel="Back to login"
    >
      <DemoForm />
    </AuthShell>
  );
}
