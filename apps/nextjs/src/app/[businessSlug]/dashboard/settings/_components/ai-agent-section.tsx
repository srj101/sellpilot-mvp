import { Bot, Clock, Save } from "lucide-react";

import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";
import { Switch } from "@acme/ui/switch";

import { SectionCard } from "./section-card";

const inputCls = "rounded-lg";

export function AiAgentSection({
  storeName,
  agentName,
  setAgentName,
  conversationTone,
  setConversationTone,
  preferredLanguage,
  setPreferredLanguage,
  followUpMinutes,
  setFollowUpMinutes,
  autoEscalateOnLowConfidence,
  setAutoEscalateOnLowConfidence,
  confidenceThreshold,
  setConfidenceThreshold,
  saving,
  onSave,
}: {
  storeName: string;
  agentName: string;
  setAgentName: (v: string) => void;
  conversationTone: string;
  setConversationTone: (v: string) => void;
  preferredLanguage: string;
  setPreferredLanguage: (v: string) => void;
  followUpMinutes: string;
  setFollowUpMinutes: (v: string) => void;
  autoEscalateOnLowConfidence: boolean;
  setAutoEscalateOnLowConfidence: (v: boolean) => void;
  confidenceThreshold: string;
  setConfidenceThreshold: (v: string) => void;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <SectionCard
      icon={Bot}
      title="AI Agent"
      description="How the AI sales agent introduces itself, talks, and follows up on abandoned conversations."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="agent-name">Agent Name</Label>
          <Input
            id="agent-name"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder={storeName || "Defaults to your business name"}
            className={inputCls}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="agent-tone">Conversation Tone</Label>
          <select
            id="agent-tone"
            value={conversationTone}
            onChange={(e) => setConversationTone(e.target.value)}
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="friendly">Friendly</option>
            <option value="professional">Professional</option>
            <option value="playful">Playful</option>
            <option value="formal">Formal</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="agent-language">Preferred Reply Language</Label>
          <select
            id="agent-language"
            value={preferredLanguage}
            onChange={(e) => setPreferredLanguage(e.target.value)}
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="auto">Auto-detect (matches customer)</option>
            <option value="bangla">Always Bangla</option>
            <option value="english">Always English</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="agent-followup" className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Abandoned Follow-up Delay (minutes)
          </Label>
          <Input
            id="agent-followup"
            type="number"
            min={1}
            value={followUpMinutes}
            onChange={(e) => setFollowUpMinutes(e.target.value)}
            placeholder="30"
            className={inputCls}
          />
        </div>
      </div>

      {/* ─── Auto-Escalation (FR-AGT-15 / FR-SET-01) ───────────── */}
      <div className="mt-6 border-t pt-4">
        <h4 className="mb-3 text-sm font-semibold text-foreground">Auto-Escalation on Low Confidence</h4>
        <p className="mb-4 text-xs text-muted-foreground">
          When the AI is uncertain about its reply, automatically hand the conversation to a human agent.
        </p>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Enable auto-escalation</Label>
            <p className="text-xs text-muted-foreground">
              Escalate to human when AI confidence falls below the threshold
            </p>
          </div>
          <Switch checked={autoEscalateOnLowConfidence} onCheckedChange={setAutoEscalateOnLowConfidence} />
        </div>
        {autoEscalateOnLowConfidence && (
          <div className="mt-3 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Confidence Threshold</Label>
              <span className="text-sm font-bold text-primary">{confidenceThreshold}%</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Below this confidence level, the AI will escalate to a human agent
            </p>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={confidenceThreshold}
              onChange={(e) => setConfidenceThreshold(e.target.value)}
              className="mt-2 w-full accent-primary"
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>0% (always escalate)</span>
              <span>50%</span>
              <span>100% (never escalate)</span>
            </div>
          </div>
        )}
      </div>
      <div className="mt-4 flex justify-end border-t pt-4">
        <Button onClick={onSave} disabled={saving} className="gap-2 rounded-lg">
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save AI Agent Settings"}
        </Button>
      </div>
    </SectionCard>
  );
}
