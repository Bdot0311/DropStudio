"use client";
import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { AlertTriangle, Check, Download, ExternalLink, ImageIcon, Info, Loader2, Package, Repeat, RotateCcw, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RenderJob } from "@/components/video/render-job";
import { SocialCuts } from "@/components/publish/social-cuts";
import { useVideoProps } from "@/hooks/use-video-props";
import { useProject } from "@/hooks/use-project";
import { biggestDropSection } from "@/lib/publish";
import { api, cn, fetcher } from "@/lib/utils";
import type { Job } from "@/lib/types";
import type { Metadata } from "@/lib/metadata";

type PublishState = {
  jobs: Record<string, Job>;
  cuts: { name: string; bytes: number; mtime: number }[];
  outputs: { main: boolean; short: boolean; loop: boolean; thumbnail: boolean };
  youtube: { configured: boolean; connected: boolean; channel: string };
};
const active = (j?: Job) => !!j && (j.status === "queued" || j.status === "running");

export default function PublishStep({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: proj } = useProject(id);
  const { data: props } = useVideoProps(id);
  const { data: peaks } = useSWR<{ data: number[] }>(`/api/projects/${id}/files/peaks.json`, fetcher);
  const { data: state, mutate } = useSWR<PublishState>(`/api/projects/${id}/publish`, fetcher, {
    refreshInterval: (d) => (d && Object.values(d.jobs).some(active) ? 1200 : 0),
  });
  const post = async (body: object) => {
    try {
      await api(`/api/projects/${id}/${"kind" in body && !("action" in body) ? "render" : "publish"}`, { method: "POST", json: body });
      mutate();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!props || !state || !proj) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-5">
      <SocialCuts id={id} props={props} peaks={peaks?.data} audioUrl={`/api/projects/${id}/files/${proj.project.playback_file}`} jobs={state.jobs} cuts={state.cuts} onRender={post} onChange={() => mutate()} />
      <div className="grid gap-6 lg:grid-cols-2">
        <ThumbnailCard id={id} jobs={state.jobs} hasThumb={state.outputs.thumbnail} onAction={post} />
        <LoopCard id={id} bpm={props.map.bpm} drop={biggestDropSection(props.map).start} job={state.jobs.render_loop} onRender={post} onChange={() => mutate()} />
      </div>
      <MetadataCard id={id} />
      <ShipCard id={id} state={state} onAction={post} onChange={() => mutate()} />
    </div>
  );
}

function ThumbnailCard({ id, jobs, hasThumb, onAction }: { id: string; jobs: Record<string, Job>; hasThumb: boolean; onAction: (b: object) => void }) {
  const cand = jobs.thumbnails;
  const fin = jobs.thumbnail_final;
  const [picked, setPicked] = useState<number | null>(null);
  const result = cand?.status === "done" ? (cand.result as { outputs: string[]; times: number[] }) : null;
  const stamp = fin?.finished_at ? Date.parse(fin.finished_at) : 0;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><ImageIcon className="h-4 w-4" /> Thumbnail</CardTitle>
        <CardDescription>1280×720 JPG under 2 MB, with your title in the preset&apos;s typography. Picked from the most intense moments.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasThumb && fin?.status === "done" && (
          <div className="space-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/projects/${id}/files/renders/thumbnail.jpg?v=${stamp}`} alt="Thumbnail" className="w-full rounded-md border" />
            <a className="inline-flex items-center gap-1 text-xs text-primary hover:underline" href={`/api/projects/${id}/files/renders/thumbnail.jpg`} download><Download className="h-3 w-3" /> thumbnail.jpg</a>
          </div>
        )}
        {active(cand) || active(fin) ? (
          <div className="space-y-2 text-sm"><div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{(cand && active(cand) ? cand : fin)!.message || "Waiting for the render worker…"}</div><Progress value={(cand && active(cand) ? cand : fin)!.progress} /></div>
        ) : result ? (
          <>
            <div className="grid grid-cols-4 gap-2">
              {result.outputs.map((o, i) => (
                <button key={o} onClick={() => setPicked(result.times[i])} className={cn("cursor-pointer overflow-hidden rounded border-2", picked === result.times[i] ? "border-primary" : "border-transparent")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/projects/${id}/files/${o}`} alt="" className="aspect-video w-full object-cover" />
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={picked === null} onClick={() => onAction({ action: "thumbnail", at: picked })}><Check /> Use this frame</Button>
              <Button size="sm" variant="ghost" onClick={() => onAction({ action: "thumbnails" })}>Find new frames</Button>
            </div>
          </>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => onAction({ action: "thumbnails" })}>Find thumbnail frames</Button>
        )}
        {cand?.status === "error" && <p className="text-xs text-destructive">{cand.error}</p>}
      </CardContent>
    </Card>
  );
}

function LoopCard({ id, bpm, drop, job, onRender, onChange }: { id: string; bpm: number; drop: number; job?: Job; onRender: (b: object) => void; onChange: () => void }) {
  const [bars, setBars] = useState(8);
  const [vertical, setVertical] = useState(true);
  const secs = (60 / bpm) * 4 * bars;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Repeat className="h-4 w-4" /> Seamless loop</CardTitle>
        <CardDescription>For Spotify Canvas (vertical, 3–8 s works best, so 4 bars at most tempos) or as live visuals. Taken from your biggest drop, no audio.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {[4, 8, 16].map((b) => <button key={b} onClick={() => setBars(b)} className={cn("cursor-pointer rounded-md border px-3 py-1.5 text-sm", bars === b ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-accent")}>{b} bars</button>)}
          <span className="mx-1 w-px bg-border" />
          {[true, false].map((v) => <button key={String(v)} onClick={() => setVertical(v)} className={cn("cursor-pointer rounded-md border px-3 py-1.5 text-sm", vertical === v ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-accent")}>{v ? "9:16 Canvas" : "16:9 visuals"}</button>)}
        </div>
        <p className="text-xs text-muted-foreground">{secs.toFixed(1)} s loop{vertical && secs > 8 ? " (Spotify Canvas accepts 3–8 s, so pick 4 bars for Canvas)" : ""}.</p>
        <Button size="sm" disabled={active(job)} onClick={() => onRender({ kind: "loop", loopBars: bars, startTime: drop, width: vertical ? 1080 : 1920, height: vertical ? 1920 : 1080, fps: 30 })}>
          <Repeat /> {active(job) ? "Rendering…" : "Render loop"}
        </Button>
        <RenderJob job={job} projectId={id} onChange={onChange} vertical={vertical} />
      </CardContent>
    </Card>
  );
}

function MetadataCard({ id }: { id: string }) {
  const { data, mutate } = useSWR<Metadata>(`/api/projects/${id}/metadata`, fetcher);
  const [m, setM] = useState<Metadata | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) setM(data); }, [data]);
  if (!m) return null;
  const save = async (body: object) => {
    setSaving(true);
    try {
      const r = await api<Metadata>(`/api/projects/${id}/metadata`, { method: "PUT", json: body });
      mutate(r, { revalidate: false });
      setM(r);
      toast.success("Metadata saved");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Title, description & tags</CardTitle>
        <CardDescription>Built from your links in <Link href="/settings" className="underline">Settings</Link>. Edit freely; it goes into the export package and the YouTube upload.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div className="space-y-1.5"><Label className="text-xs">Video title ({m.title.length}/100)</Label><Input value={m.title} onChange={(e) => setM({ ...m, title: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Shorts title</Label><Input value={m.shortsTitle} onChange={(e) => setM({ ...m, shortsTitle: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Tags (comma separated)</Label><Textarea value={m.tags.join(", ")} onChange={(e) => setM({ ...m, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} className="min-h-[80px]" /></div>
          <div className="space-y-1.5">
            <Label className="text-xs">Visibility when uploading</Label>
            <Select value={m.privacy} onValueChange={(v) => setM({ ...m, privacy: v as Metadata["privacy"] })}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="private">Private (recommended)</SelectItem><SelectItem value="unlisted">Unlisted</SelectItem><SelectItem value="public">Public</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Description</Label><Textarea value={m.description} onChange={(e) => setM({ ...m, description: e.target.value })} className="min-h-[280px] font-mono text-xs" /></div>
        <div className="flex gap-2 md:col-span-2">
          <Button size="sm" onClick={() => save(m)} disabled={saving}><Save /> Save</Button>
          <Button size="sm" variant="ghost" onClick={() => save({ reset: true })}><RotateCcw /> Rebuild from template</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ShipCard({ id, state, onAction, onChange }: { id: string; state: PublishState; onAction: (b: object) => void; onChange: () => void }) {
  const ex = state.jobs.export;
  const yt = state.youtube;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Package className="h-4 w-4" /> Export package</CardTitle>
          <CardDescription>A zip with the video, Shorts cut, thumbnail, loop and metadata.txt, for manual upload in YouTube Studio. Always works.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-1 text-sm">
            {state.cuts.length > 1 && <li className="text-xs text-muted-foreground">+ {state.cuts.length} social cut{state.cuts.length === 1 ? "" : "s"} included</li>}
            {([["main", "Main video"], ["short", "Shorts cut"], ["thumbnail", "Thumbnail"], ["loop", "Loop (optional)"]] as const).map(([k, l]) => (
              <li key={k} className={cn("flex items-center gap-2", state.outputs[k] ? "text-foreground" : "text-muted-foreground")}>
                {state.outputs[k] ? <Check className="h-4 w-4 text-success" /> : <span className="inline-block h-4 w-4 rounded-full border" />} {l}
              </li>
            ))}
          </ul>
          <Button onClick={() => onAction({ action: "export" })} disabled={!state.outputs.main || active(ex)}>
            {active(ex) ? <Loader2 className="animate-spin" /> : <Package />} Export package
          </Button>
          {!state.outputs.main && <p className="text-xs text-muted-foreground">Render the main video first (<Link className="underline" href={`/projects/${id}/render`}>Render</Link>).</p>}
          {ex?.status === "done" && (
            <a className="flex items-center gap-1.5 text-sm text-primary hover:underline" href={`/api/projects/${id}/files/${(ex.result as { output: string }).output}`} download>
              <Download className="h-4 w-4" /> Download {(ex.result as { output: string }).output.split("/").pop()} ({(((ex.result as { bytes: number }).bytes) / 1e6).toFixed(0)} MB)
            </a>
          )}
          {ex?.status === "error" && <p className="text-xs text-destructive">{ex.error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Upload className="h-4 w-4" /> Upload to YouTube</CardTitle>
          <CardDescription>Optional. Uploads go up as <b>private</b> (unless you changed visibility above) so you can review them in YouTube Studio first.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
            <p className="flex gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /><span>Videos uploaded through an <b>unverified</b> Google Cloud project are locked to private until Google audits the project. You can still make them public by hand in YouTube Studio.</span></p>
            <p className="flex gap-1.5"><Info className="h-3.5 w-3.5 shrink-0" /><span>Each upload uses about 1,600 of the default 10,000 daily API quota units.</span></p>
            <p className="flex gap-1.5"><Info className="h-3.5 w-3.5 shrink-0" /><span>If your track is distributed with YouTube Content ID, whitelist your own channel with your distributor first, or your own video will be claimed.</span></p>
          </div>
          {!yt.connected ? (
            <p className="text-sm text-muted-foreground">Not connected. Set it up in <Link href="/settings#youtube" className="text-primary underline">Settings → YouTube</Link> (step-by-step guide there).</p>
          ) : (
            <>
              <p className="text-sm">Connected{yt.channel ? <> as <b>{yt.channel}</b></> : ""}.</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={!state.outputs.main || active(state.jobs.upload_main)} onClick={() => onAction({ action: "upload", kind: "main" })}><Upload /> Upload main video</Button>
                <Button size="sm" variant="secondary" disabled={!state.outputs.short || active(state.jobs.upload_short)} onClick={() => onAction({ action: "upload", kind: "short" })}><Upload /> Upload Shorts cut</Button>
              </div>
            </>
          )}
          {(["upload_main", "upload_short"] as const).map((k) => <UploadStatus key={k} job={state.jobs[k]} onChange={onChange} />)}
        </CardContent>
      </Card>
    </div>
  );
}

function UploadStatus({ job, onChange }: { job?: Job; onChange: () => void }) {
  if (!job) return null;
  const label = (job.params as { kind?: string }).kind === "short" ? "Shorts cut" : "Main video";
  if (active(job)) return <div className="space-y-1.5 text-sm"><div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{label}: {job.message || "waiting…"}</div><Progress value={job.progress} /></div>;
  if (job.status === "error") return (
    <div className="flex items-start gap-2 text-xs text-destructive"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{label}: {job.error} <button className="cursor-pointer underline" onClick={async () => { await api(`/api/jobs/${job.id}/retry`, { method: "POST" }); onChange(); }}>Retry</button></span></div>
  );
  if (job.status === "done") {
    const r = job.result as { url: string; studio: string; privacy: string; thumbnail: string };
    return (
      <div className="text-sm">
        <Check className="mr-1 inline h-4 w-4 text-success" />{label} uploaded ({r.privacy}, thumbnail {r.thumbnail}).{" "}
        <a className="inline-flex items-center gap-1 text-primary hover:underline" href={r.studio} target="_blank" rel="noreferrer">Open in YouTube Studio <ExternalLink className="h-3 w-3" /></a>
      </div>
    );
  }
  return null;
}
