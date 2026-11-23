"use client";
import { use, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Clapperboard, Dices, Loader2, RefreshCw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CostMeter } from "@/components/ai/cost-meter";
import { ProviderBanner } from "@/components/ai/provider-banner";
import { ConfirmSpend } from "@/components/ai/confirm-spend";
import { STATUS_LABEL, ShotThumb } from "@/components/ai/shot-card";
import { jobActive, useShots } from "@/hooks/use-shots";
import { SECTION_COLORS } from "@/lib/grid";
import { api, cn } from "@/lib/utils";
import type { Shot } from "@/lib/shots";

export default function GenerateStep({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, mutate } = useShots(id);
  const [tier, setTier] = useState<"draft" | "final">("draft");
  const [confirm, setConfirm] = useState<{ ids?: string[] } | null>(null);

  if (!data) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  const queue = data.shots.filter((s) => s.status === "approved" || s.status.startsWith("clip_") || (s.status === "error" && s.keyframe));
  const pending = queue.filter((s) => s.status === "approved");
  const ready = queue.filter((s) => s.status === "clip_ready");
  const job = data.jobs.clips;
  const price = data.prices[tier];
  const footage = ready.reduce((a, s) => a + (s.clip_duration ?? 5), 0);

  return (
    <div className="space-y-4 p-5">
      <CostMeter spent={data.spent} cap={data.cap} provider={data.provider.label} />
      <ProviderBanner provider={data.provider.id} keys={data.keys} onChange={() => mutate()} />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {job && jobActive(job) && (
            <div className="space-y-2 rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-primary" /> {job.status === "queued" ? "Waiting for the worker…" : job.message}
                <Button size="sm" variant="ghost" className="ml-auto" onClick={async () => { await api(`/api/jobs/${job.id}/cancel`, { method: "POST" }); mutate(); }}><X /> Stop</Button>
              </div>
              <Progress value={job.progress} />
            </div>
          )}
          {!queue.length && (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
              No approved keyframes yet. Approve some on the <Link className="text-primary underline" href={`/projects/${id}/storyboard`}>Storyboard</Link> first. Only approved keyframes get animated, so you never pay for clips you don&apos;t want.
            </CardContent></Card>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {queue.map((s) => <ClipRow key={s.id} shot={s} projectId={id} unit={price.unit} onChange={() => mutate()} onRegenerate={(ids) => setConfirm({ ids })} />)}
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Animate keyframes</CardTitle>
              <CardDescription className="text-xs">Each approved keyframe becomes one {price.seconds}-second clip. The editor reuses every clip many times (trims, speed ramps, mirror, reverse), so a 6-minute track needs only ~60–100 s of footage.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {(["draft", "final"] as const).map((t) => (
                  <button key={t} onClick={() => setTier(t)} className={cn("cursor-pointer rounded-md border p-2.5 text-left", tier === t ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-accent")}>
                    <div className="text-sm font-medium capitalize">{t}</div>
                    <div className="text-[11px] text-muted-foreground">${data.prices[t].unit.toFixed(2)} / clip</div>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">{price.model}</p>
              <Button className="w-full" onClick={() => setConfirm({})} disabled={!pending.length || jobActive(job)}>
                <Clapperboard /> Animate {pending.length} clip{pending.length === 1 ? "" : "s"} (~${(pending.length * price.unit).toFixed(2)})
              </Button>
              <div className="text-xs text-muted-foreground">{ready.length} clips ready · {Math.round(footage)} s of footage</div>
            </CardContent>
          </Card>
          <Button asChild variant="outline" className="w-full" disabled={!ready.length}>
            <Link href={`/projects/${id}/render`}>Continue to Render <ArrowRight /></Link>
          </Button>
        </div>
      </div>

      <ConfirmSpend open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} projectId={id} kind="clips" tier={tier} shotIds={confirm?.ids} onStarted={() => mutate()} />
    </div>
  );
}

function ClipRow({ shot, projectId, unit, onChange, onRegenerate }: { shot: Shot; projectId: string; unit: number; onChange: () => void; onRegenerate: (ids: string[]) => void }) {
  const working = /_(queued|running)$/.test(shot.status);
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {shot.clip ? (
        <video src={`/api/${shot.clip}`} muted loop autoPlay playsInline className="aspect-video w-full bg-black object-cover" />
      ) : (
        <ShotThumb shot={shot} className="rounded-none" />
      )}
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <Badge className="capitalize" style={{ background: SECTION_COLORS[shot.section_type].solid, color: "#0a0a0a" }}>{shot.section_type}</Badge>
          <span className={cn("ml-auto text-xs", shot.status === "error" ? "text-destructive" : "text-muted-foreground")}>{STATUS_LABEL[shot.status]}</span>
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">{shot.prompt}</p>
        {shot.error && <div className="flex gap-1.5 text-xs text-destructive"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{shot.error}</div>}
        <div className="flex gap-1.5">
          {shot.status === "error" && (
            <Button size="sm" variant="secondary" onClick={() => onRegenerate([shot.id])}><RefreshCw /> Retry this clip</Button>
          )}
          {shot.status === "clip_ready" && !working && (
            <Button size="sm" variant="ghost" title={`Replace just this clip (~$${unit.toFixed(2)}); other clips are not re-billed`} onClick={async () => {
              await api(`/api/projects/${projectId}/shots/${shot.id}`, { method: "PATCH", json: { reseedClip: true } });
              onChange();
              onRegenerate([shot.id]);
            }}>
              <Dices /> New variation
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
