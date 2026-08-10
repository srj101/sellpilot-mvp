"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileText, HelpCircle, Loader2, Truck } from "lucide-react";

import { Button } from "@acme/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@acme/ui/dialog";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";
import { Switch } from "@acme/ui/switch";
import { toast } from "@acme/ui/toast";

import { useTRPC } from "~/trpc/react";

export function CreateShippingRateDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const trpc = useTRPC();
  const createMutation = useMutation(trpc.settings.createShippingRate.mutationOptions());
  const [district, setDistrict] = useState("");
  const [cost, setCost] = useState("");
  const [estimatedDays, setEstimatedDays] = useState("");
  const [active, setActive] = useState(true);

  const valid = district.trim().length > 0 && Number(cost) >= 0 && cost !== "";

  const handleCreate = async () => {
    try {
      await createMutation.mutateAsync({
        district: district.trim(),
        cost: Number(cost),
        estimatedDays: estimatedDays !== "" ? Number(estimatedDays) : undefined,
        active,
      });
      toast.success(`Shipping rate for ${district.trim()} created`);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create shipping rate");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-4 w-4" /> Create shipping rate
          </DialogTitle>
          <DialogDescription>
            Add a flat delivery cost for a district. The AI agent uses these to quote shipping.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ship-district">District</Label>
            <Input
              id="ship-district"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              placeholder="Dhaka"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ship-cost">Cost (৳)</Label>
              <Input
                id="ship-cost"
                type="number"
                min={0}
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="60"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ship-days">Est. Delivery Days</Label>
              <Input
                id="ship-days"
                type="number"
                min={0}
                value={estimatedDays}
                onChange={(e) => setEstimatedDays(e.target.value)}
                placeholder="3"
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Active</Label>
              <p className="text-xs text-muted-foreground">Use this rate for new quotes</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!valid || createMutation.isPending} className="gap-1.5">
            {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CreateFaqDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const trpc = useTRPC();
  const createMutation = useMutation(trpc.settings.createFaq.mutationOptions());
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [tags, setTags] = useState("");

  const valid = question.trim().length > 0 && answer.trim().length > 0;

  const handleCreate = async () => {
    try {
      await createMutation.mutateAsync({
        question: question.trim(),
        answer: answer.trim(),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      toast.success("FAQ created");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create FAQ");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4" /> Create FAQ
          </DialogTitle>
          <DialogDescription>
            Add a question your customers frequently ask. The AI agent uses these to answer.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="faq-question">Question</Label>
            <Input
              id="faq-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Do you deliver outside Dhaka?"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="faq-answer">Answer</Label>
            <textarea
              id="faq-answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Yes, we deliver nationwide. Shipping outside Dhaka takes 3-5 business days."
              className="flex min-h-[100px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="faq-tags">Tags (comma-separated)</Label>
            <Input
              id="faq-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="shipping, delivery"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!valid || createMutation.isPending} className="gap-1.5">
            {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CreatePolicyDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const trpc = useTRPC();
  const createMutation = useMutation(trpc.settings.createPolicy.mutationOptions());
  const [type, setType] = useState<"shipping" | "return" | "warranty" | "privacy" | "terms">("return");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [active, setActive] = useState(true);

  const valid = title.trim().length > 0 && body.trim().length > 0;

  const handleCreate = async () => {
    try {
      await createMutation.mutateAsync({
        type,
        title: title.trim(),
        body: body.trim(),
        active,
      });
      toast.success("Policy created");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create policy");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> Create policy
          </DialogTitle>
          <DialogDescription>
            Document a store policy. The AI agent uses these to answer customer questions.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="policy-type">Type</Label>
              <select
                id="policy-type"
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="shipping">Shipping</option>
                <option value="return">Return</option>
                <option value="warranty">Warranty</option>
                <option value="privacy">Privacy</option>
                <option value="terms">Terms</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="policy-title">Title</Label>
              <Input
                id="policy-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Returns & Exchange Policy"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="policy-body">Policy text</Label>
            <textarea
              id="policy-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Items can be returned within 7 days of delivery..."
              className="flex min-h-[120px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Active</Label>
              <p className="text-xs text-muted-foreground">Make this policy available to the AI agent</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!valid || createMutation.isPending} className="gap-1.5">
            {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
