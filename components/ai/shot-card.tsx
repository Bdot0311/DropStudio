"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, Check, Dices, ImageOff, Loader2, Trash2, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { SECTION_COLORS } from "@/lib/grid";
import { api, cn } from "@/lib/utils";
import type { Shot } from "@/lib/shots";

export const STATUS_LABEL: Record<Shot["status"], string> = {
  draft: "No keyframe yet",
  keyframe_queued: "Queued",
  keyframe_running: "Generating keyframe…",
  keyframe_ready: "Needs review",
  approved: "Approved",
  rejected: "Rejected",
  clip_queued: "Clip queued",
  clip_running: "Animating…",
  clip_ready: "Clip ready",
  error: "Failed",
};

export function ShotThumb({ shot, className }: { shot: Shot; className?: string }) {
  const working = /_(queued|running)$/.test(shot.status);
  return (
    <div className={cn("relative aspect-video overflow-hidden rounded-md bg-secondary", className)}>
      {shot.keyframe ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/${shot.keyframe}`} alt="" className={cn("h-full w-full object-cover", shot.status === "rejected" && "opacity-30 grayscale")} />
      ) : (
        <div className="grid h-full w-full place-items-center text-muted-foreground"><ImageOff className="h-5 w-5" /></div>
      )}
      {working && <div className="absolute inset-0 grid place-items-center bg-black/50"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>}
    </div>
  );
}

export function ShotCard({ shot, projectId, onChange, compact, hasCharacter }: { shot: Shot; projectId: string; onChange: () => void; compact?: boolean; hasCharacter?: boolean }) {
  const [prompt, setPrompt] = useState(shot.prompt);
  useEffect(() => setPrompt(shot.prompt), [shot.prompt]);
  const working = /_(queued|running)$/.test(shot.status);

  const patch = async (body: object) => {
    try {
      await api(`/api/projects/${projectId}/shots/${shot.id}`, { method: "PATCH", json: body });
      onChange();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const decided = shot.status === "approved" || shot.status === "rejected" || shot.status.startsWith("clip_");
  return (
    <div className={cn("overflow-hidden rounded-lg border bg-card", shot.status === "approved" || shot.status === "clip_ready" ? "border-success/60" : shot.status === "rejected" && "opacity-70")}>
      <ShotThumb shot={shot} className="rounded-none" />
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <Badge className="capitalize" style={{ background: SECTION_COLORS[shot.section_type].solid, color: "#0a0a0a" }}>{shot.section_type}</Badge>
          <span className="text-xs text-muted-foreground">#{shot.idx + 1}</span>
          {hasCharacter && (
            <button
              disabled={working}
              title={shot.character ? "This shot features you. Click for a scene-only shot." : "Click to feature you (your character photos) in this shot"}
              onClick={() => patch({ character: !shot.character })}
              className={cn("cursor-pointer rounded-full border px-2 py-0.5 text-[10px]", shot.character ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}
            >
              {shot.character ? "★ You" : "+ Feature me"}
            </button>
          )}
          <span className={cn("ml-auto text-xs", shot.status === "error" ? "text-destructive" : shot.status === "keyframe_ready" ? "text-warning" : "text-muted-foreground")}>{STATUS_LABEL[shot.status]}</span>
        </div>
        {!compact && (
          <Textarea
            value={prompt}
            disabled={working}
            onChange={(e) => setPrompt(e.target.value)}
            onBlur={() => prompt !== shot.prompt && patch({ prompt })}
            className="min-h-[64px] text-xs"
          />
        )}
        {shot.error && (
          <div className="flex gap-1.5 text-xs text-destructive"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{shot.error}</div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {shot.keyframe && !decided && (
            <>
              <Button size="sm" variant="secondary" className="text-success" onClick={() => patch({ decision: "approve" })}><Check /> Approve</Button>
              <Button size="sm" variant="secondary" onClick={() => patch({ decision: "reject" })}><X /> Reject</Button>
            </>
          )}
          {decided && !working && <Button size="sm" variant="ghost" onClick={() => patch({ decision: "undo" })}><Undo2 /> Undo</Button>}
          {shot.keyframe && !working && (
            <Button size="sm" variant="ghost" title="Throw this image away and get a new one next time you generate (costs one image)" onClick={() => patch({ reseed: true })}><Dices /> New variation</Button>
          )}
          {!compact && !working && (
            <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" title="Delete shot" onClick={async () => { await api(`/api/projects/${projectId}/shots/${shot.id}`, { method: "DELETE" }); onChange(); }}><Trash2 /></Button>
          )}
        </div>
      </div>
    </div>
  );
}
