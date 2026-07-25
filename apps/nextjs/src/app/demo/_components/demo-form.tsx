"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, LoaderCircle, Send } from "lucide-react";

import { Button } from "@acme/ui/button";
import { Field, FieldLabel } from "@acme/ui/field";
import { Input } from "@acme/ui/input";
import { useTRPC } from "~/trpc/react";

export function DemoForm() {
  const trpc = useTRPC();
  const requestDemo = useMutation(trpc.business.requestDemo.mutationOptions());

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    requestDemo.mutate(
      { fullName, email, phone: phone || undefined, businessName: businessName || undefined, message: message || undefined },
      {
        onSuccess: () => setSubmitted(true),
        onError: (err) => setError(err.message || "Something went wrong — please try again."),
      },
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border bg-background/60 p-8 text-center backdrop-blur">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="h-6 w-6 text-emerald-500" />
        </div>
        <p className="font-semibold">Thanks — we'll be in touch soon!</p>
        <p className="text-sm text-muted-foreground">
          Our team will reach out to {email} within one business day to schedule your walkthrough.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Field>
        <FieldLabel htmlFor="fullName" className="text-sm font-medium">Full name</FieldLabel>
        <Input
          id="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Sarah Lee"
          required
          className="h-11 rounded-xl"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="email" className="text-sm font-medium">Work email</FieldLabel>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          required
          className="h-11 rounded-xl"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor="phone" className="text-sm font-medium">Phone (optional)</FieldLabel>
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+880 1XXXXXXXXX"
            className="h-11 rounded-xl"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="businessName" className="text-sm font-medium">Business (optional)</FieldLabel>
          <Input
            id="businessName"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Aurora Goods"
            className="h-11 rounded-xl"
          />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="message" className="text-sm font-medium">What are you hoping to solve? (optional)</FieldLabel>
        <textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="Tell us a bit about your business..."
          className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
        />
      </Field>

      <Button type="submit" size="lg" className="w-full rounded-xl" disabled={requestDemo.isPending}>
        {requestDemo.isPending ? (
          <LoaderCircle className="size-4 animate-spin mr-2" />
        ) : (
          <Send className="size-4 mr-2" />
        )}
        Request Demo
      </Button>
    </form>
  );
}
