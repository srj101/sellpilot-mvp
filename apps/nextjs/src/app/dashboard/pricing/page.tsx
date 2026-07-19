import { redirect } from "next/navigation";
import { Check, HelpCircle } from "lucide-react";

import { getSession } from "~/auth/server";
import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@acme/ui/card";
import { Button } from "@acme/ui/button";

export default async function PricingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Format currency helper
  const formatCurrency = (val: number) => `৳${Math.round(val).toLocaleString()}`;

  const plans = [
    {
      name: "Starter",
      price: 2500,
      description: "Essential tools for small businesses starting with automated messaging.",
      features: [
        "1 Connected Channel (WhatsApp or Facebook)",
        "Up to 500 active contacts / month",
        "Standard AI automated replies",
        "Basic Overview Analytics",
        "Email support",
      ],
      cta: "Start Free Trial",
      popular: false,
    },
    {
      name: "Professional",
      price: 7500,
      description: "Scale your business across multiple channels with advanced AI automation.",
      features: [
        "3 Connected Channels (WhatsApp, FB, & Insta)",
        "Up to 2,500 active contacts / month",
        "Advanced customized AI reply agent",
        "Detailed Analytics & Exports",
        "Prioritized Chat Support",
        "Wordpress & Shopify integrations",
      ],
      cta: "Choose Professional",
      popular: true,
    },
    {
      name: "Enterprise",
      price: 25000,
      description: "Dedicated resources and absolute control for large organizations.",
      features: [
        "Unlimited Connected Channels",
        "Unlimited active contacts",
        "Dedicated custom fine-tuned LLM models",
        "Advanced Analytics & Custom Webhooks",
        "Dedicated Account Manager & 24/7 SLA",
        "Unlimited team seats",
      ],
      cta: "Contact Sales",
      popular: false,
    },
  ];

  return (
    <DashboardShell>
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center space-y-3 max-w-xl mx-auto">
          <h1 className="text-3xl font-bold tracking-tight">Flexible Plans Tailored to Your Growth</h1>
          <p className="text-muted-foreground text-sm">
            Unlock the power of conversational commerce and auto-pilot your sales. No hidden fees. Cancel anytime.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <Card
              key={p.name}
              className={`card-hover relative flex flex-col justify-between p-6 ${
                p.popular ? "ring-2 ring-primary border-primary bg-primary/5" : ""
              }`}
            >
              {p.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                  Most Popular
                </span>
              )}

              <div>
                <CardHeader className="p-0 mb-4">
                  <CardTitle className="text-xl font-bold text-foreground">{p.name}</CardTitle>
                  <CardDescription className="mt-1 text-xs text-muted-foreground">{p.description}</CardDescription>
                </CardHeader>

                <CardContent className="p-0 mb-6">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl font-extrabold text-foreground">{formatCurrency(p.price)}</span>
                    <span className="text-xs text-muted-foreground">/ month</span>
                  </div>

                  <div className="mt-6 space-y-3.5">
                    {p.features.map((f) => (
                      <div key={f} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                        <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </div>

              <CardFooter className="p-0 pt-6 border-t mt-auto">
                <Button className="w-full rounded-lg" variant={p.popular ? "default" : "outline"}>
                  {p.cta}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
