"use client";
import { use, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCheck, LayoutGrid, List, Loader2, Sparkles, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CostMeter } from "@/components/ai/cost-meter";
import { ProviderBanner } from "@/components/ai/provider-banner";
import { ConfirmSpend } from "@/components/ai/confirm-spend";
import { ModelLine } from "@/components/ai/model-browser";
import { ShotCard } from "@/components/ai/shot-card";
import { TimelineLane } from "@/components/ai/timeline-lane";
import { jobActive, useShots } from "@/hooks/use-shots";
import { useProject } from "@/hooks/use-project";
import { api, cn, fetcher } from "@/lib/utils";
import useSWR from "swr";
import { DEFAULT_WORLD } from "@/lib/director";

export default function StoryboardStep({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: proj } = useProject(id);
  const { data, mutate } = useShots(id);
  const [view, setView] = useState<"list" | "grid">("list");
  const [confirm, setConfirm] = useState(false);
  const [building, setBuilding] = useState(false);

  if (proj?.project.mode === "visualizer") {
    return (
      <div className="mx-auto max-w-lg p-10 text-center text-sm text-muted-foreground">
        This project uses the free visualizer, so there&apos;s nothing to storyboard. Switch to AI montage or Hybrid on the{" "}
        <Link href={`/projects/${id}/style`} className="text-primary underline">Style</Link> step, or go straight to{" "}
        <Link href={`/projects/${id}/render`} className="text-primary underline">Render</Link>.
      </div>
    );
  }
  if (!data) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  const shots = data.shots;
  const job = data.jobs.keyframes;
  const needKeyframes = data.needKeyframes;
  const toReview = shots.filter((s) => s.status === "keyframe_ready");
  const approved = shots.filter((s) => s.status === "approved" || s.status.startsWith("clip_")).length;

  async function build() {
    if (shots.length && !confirmDialog("Replace the current storyboard? Generated images stay cached, so changing back is free.")) return;
    setBuilding(true);
    try {
      await api(`/api/projects/${id}/shots`, { method: "POST", json: { action: "build", replace: true } });
      mutate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBuilding(false);
    }
  }

  async function approveAll() {
    await Promise.all(toReview.map((s) => api(`/api/projects/${id}/shots/${s.id}`, { method: "PATCH", json: { decision: "approve" } })));
    mutate();
  }

  return (
    <div className="space-y-4 p-5">
      <CostMeter spent={data.spent} cap={data.cap} provider={data.provider.label} />
      <ProviderBanner provider={data.provider.id} keys={data.keys} onChange={() => mutate()} />

      {!shots.length ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Sparkles className="mx-auto mb-3 h-8 w-8 text-primary" />
            <p className="font-medium">Create a storyboard</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Drop Studio writes 8–20 shot prompts from your preset and vibe, mapped to your {proj?.project.mode === "hybrid" ? "builds and drops" : "sections"}. Free: nothing is generated yet.
            </p>
            <Button className="mt-5" onClick={build} disabled={building}>{building ? <Loader2 className="animate-spin" /> : <Wand2 />} Write storyboard</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">AI footage on:</span>
            {([["hybrid", "Builds & drops (shaders elsewhere)"], ["montage", "Every section"]] as const).map(([m, l]) => (
              <button
                key={m}
                onClick={async () => {
                  if (data.mode === m) return;
                  try {
                    await api(`/api/projects/${id}/shots`, { method: "POST", json: { action: "coverage", mode: m } });
                    mutate();
                    toast.success(m === "montage" ? "AI footage on every section: shots added for the missing sections. Existing keyframes kept." : "AI footage on builds and drops only; other sections use shader visuals.");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
                className={cn("cursor-pointer rounded-md border px-2.5 py-1 text-xs", data.mode === m ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-accent")}
              >
                {l}
              </button>
            ))}
          </div>
          <StoryLook id={id} />
          <div className="space-y-1.5 rounded-lg border bg-card px-4 py-2.5">
            <ModelLine label="Keyframe model" role="image" current={data.prices.image.model} onPicked={() => mutate()} disabled={data.provider.id !== "fal" ? "Switch to fal.ai in Settings to choose from every model" : null} />
            {data.hasCharacter && <ModelLine label="Shots of you" role="character" current={data.prices.character.model} onPicked={() => mutate()} disabled={data.provider.id !== "fal" ? " " : null} />}
          </div>
          <TimelineLane projectId={id} shots={shots} mode={data.mode} onAdd={async (i) => { await api(`/api/projects/${id}/shots`, { method: "POST", json: { action: "add", sectionIndex: i } }); mutate(); }} />

          {data.otherProviderKeyframes > 0 && (
            <p className="text-xs text-muted-foreground">{data.otherProviderKeyframes} keyframe{data.otherProviderKeyframes === 1 ? " was" : "s were"} made with another provider and will be regenerated with {data.provider.label}.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setConfirm(true)} disabled={!needKeyframes || jobActive(job)}>
              <Sparkles /> Generate {needKeyframes || ""} keyframe{needKeyframes === 1 ? "" : "s"}
              {needKeyframes ? <span className="opacity-70">(~${data.keyframeCost.toFixed(2)})</span> : null}
            </Button>
            {toReview.length > 0 && <Button variant="secondary" onClick={approveAll}><CheckCheck /> Approve all {toReview.length} to review</Button>}
            <Button variant="ghost" onClick={build} disabled={building}><Wand2 /> Rewrite storyboard</Button>
            <div className="ml-auto flex items-center gap-1 rounded-md border p-0.5">
              <button onClick={() => setView("list")} className={cn("cursor-pointer rounded px-2 py-1", view === "list" && "bg-accent")} title="Cards with prompts"><List className="h-4 w-4" /></button>
              <button onClick={() => setView("grid")} className={cn("cursor-pointer rounded px-2 py-1", view === "grid" && "bg-accent")} title="Approval grid"><LayoutGrid className="h-4 w-4" /></button>
            </div>
          </div>

          {job && jobActive(job) && (
            <div className="space-y-2 rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-primary" /> {job.status === "queued" ? "Waiting for the worker…" : job.message}
                <Button size="sm" variant="ghost" className="ml-auto" onClick={async () => { await api(`/api/jobs/${job.id}/cancel`, { method: "POST" }); mutate(); }}><X /> Stop</Button>
              </div>
              <Progress value={job.progress} />
            </div>
          )}

          <div className={cn("grid gap-3", view === "grid" ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4")}>
            {shots.map((s) => <ShotCard key={s.id} shot={s} projectId={id} onChange={() => mutate()} compact={view === "grid"} hasCharacter={data.hasCharacter} />)}
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-card p-4 text-sm">
            <span className="text-muted-foreground">{approved} approved · {toReview.length} to review · {shots.filter((s) => s.status === "rejected").length} rejected</span>
            <Button asChild disabled={!approved}><Link href={`/projects/${id}/generate`}>Animate approved keyframes <ArrowRight /></Link></Button>
          </div>
        </>
      )}

      <ConfirmSpend open={confirm} onOpenChange={setConfirm} projectId={id} kind="keyframes" onStarted={() => mutate()} />
    </div>
  );
}

function confirmDialog(msg: string) {
  return typeof window !== "undefined" ? window.confirm(msg) : true;
}

function StoryLook({ id }: { id: string }) {
  const { data, mutate } = useSWR<{ style: { director?: { world: string; wardrobe: string } }; preset: string }>(`/api/projects/${id}/style`, fetcher);
  const [world, setWorld] = useState<string | null>(null);
  const [wardrobe, setWardrobe] = useState<string | null>(null);
  if (!data) return null;
  const def = DEFAULT_WORLD[data.preset] ?? DEFAULT_WORLD.melodic;
  const w = world ?? data.style.director?.world ?? "";
  const r = wardrobe ?? data.style.director?.wardrobe ?? "";
  const save = async () => {
    await api(`/api/projects/${id}/style`, { method: "PUT", json: { style: { director: { world: w, wardrobe: r } } } });
    mutate();
    toast.success("Saved. Click Rewrite storyboard to apply it to every shot.");
  };
  return (
    <div className="grid gap-2 rounded-lg border bg-card p-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
      <label className="space-y-1 text-[11px] text-muted-foreground">
        <span>Story world (every shot takes place here)</span>
        <input value={w} placeholder={def.world} onChange={(e) => setWorld(e.target.value)} className="flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs text-foreground placeholder:text-muted-foreground" />
      </label>
      <label className="space-y-1 text-[11px] text-muted-foreground">
        <span>Your wardrobe (kept the same in every shot)</span>
        <input value={r} placeholder={def.wardrobe} onChange={(e) => setWardrobe(e.target.value)} className="flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs text-foreground placeholder:text-muted-foreground" />
      </label>
      <Button size="sm" variant="secondary" onClick={save}>Save look</Button>
    </div>
  );
}
