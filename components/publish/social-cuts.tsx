"use client";
import { useMemo, useState } from "react";
import { Check, Download, Film, RotateCcw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PreviewPlayer } from "@/components/video/preview-player";
import { RenderJob } from "@/components/video/render-job";
import { ShortsTrimmer } from "./shorts-trimmer";
import { SOCIAL_PRESETS, biggestDropSection, windowForLength, type SocialPreset } from "@/lib/publish";
import { fmtTime } from "@/lib/grid";
import { cn } from "@/lib/utils";
import type { Job } from "@/lib/types";
import type { VideoProps } from "@/remotion/types";

const fileName = (p: SocialPreset, len: number) => (p.id === "shorts" ? p.file : p.max === Infinity ? p.file : `${p.file}-${Math.round(len)}s`);

/** Social cuts for TikTok, Reels, Shorts, feed and square, at any length up to each platform's limit. */
export function SocialCuts({
  id, props, peaks, audioUrl, jobs, cuts, onRender, onChange,
}: {
  id: string; props: VideoProps; peaks?: number[]; audioUrl: string; jobs: Record<string, Job>;
  cuts: { name: string; bytes: number; mtime: number }[];
  onRender: (b: object) => void; onChange: () => void;
}) {
  const map = props.map;
  const [presetId, setPresetId] = useState("shorts");
  const preset = SOCIAL_PRESETS.find((p) => p.id === presetId)!;
  const full = preset.max === Infinity;
  const [target, setTarget] = useState(preset.def);
  const suggested = useMemo(() => (full ? { start: 0, end: map.duration } : windowForLength(map, target)), [map, target, full]);
  const [win, setWin] = useState(suggested);
  const [winKey, setWinKey] = useState(`${presetId}-${target}`);
  if (winKey !== `${presetId}-${target}`) {
    setWinKey(`${presetId}-${target}`);
    setWin(suggested);
  }
  const drop = biggestDropSection(map);
  const len = win.end - win.start;
  const lead = drop.start - win.start;
  const name = fileName(preset, len);
  const job = jobs[`render_${name}`];
  const maxLen = Math.min(preset.max, map.duration);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Smartphone className="h-4 w-4" /> Social cuts: TikTok, Reels, Shorts and more</CardTitle>
        <CardDescription>Pick a platform and a length. The window starts 2 bars before your biggest drop (red line) so the drop hits in the first seconds. Drag it anywhere; it snaps to bars.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {SOCIAL_PRESETS.map((p) => (
            <button key={p.id} onClick={() => { setPresetId(p.id); setTarget(p.def); }} className={cn("cursor-pointer rounded-md border px-3 py-1.5 text-sm", presetId === p.id ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-accent")}>
              {p.label}
              <span className="ml-1.5 text-[11px] text-muted-foreground">{p.w === p.h ? "1:1" : p.h === 1350 ? "4:5" : "9:16"}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{preset.note}</p>

        {!full && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Length:</span>
            {preset.lengths.filter((l) => l <= map.duration).map((l) => (
              <button key={l} onClick={() => setTarget(l)} className={cn("cursor-pointer rounded-md border px-2.5 py-1 text-xs", Math.abs(target - l) < 0.5 ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-accent")}>
                {l >= 60 ? `${l / 60} min` : `${l} s`}
              </button>
            ))}
          </div>
        )}

        {peaks && !full && (
          <ShortsTrimmer key={winKey} audioUrl={audioUrl} peaks={peaks} duration={map.duration} downbeats={map.downbeats} dropAt={drop.start} value={win} onChange={setWin} minLen={5} maxLen={maxLen} />
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="font-mono">{fmtTime(win.start)} → {fmtTime(win.end)}</span>
          <span className="text-muted-foreground">{len.toFixed(1)} s · {preset.w}×{preset.h}</span>
          {!full && (
            <span className={cn(lead > 0 && win.end > drop.start ? "text-success" : "text-warning")}>
              {lead > 0 && win.end > drop.start ? <><Check className="mr-1 inline h-3.5 w-3.5" />drop hits {lead.toFixed(1)} s in, on a cut</> : "the drop isn't inside this window"}
            </span>
          )}
          {!full && <Button size="sm" variant="ghost" onClick={() => setWin(suggested)}><RotateCcw /> Reset</Button>}
        </div>

        <div className="grid gap-4 md:grid-cols-[auto_1fr]">
          <PreviewPlayer key={`${presetId}-${win.start}-${len}`} props={props} startTime={win.start} duration={len} width={preset.w} height={preset.h} className={preset.w >= preset.h ? "w-[300px]" : "w-[220px]"} />
          <div className="space-y-3">
            <Button onClick={() => onRender({ kind: "short", name, startTime: win.start, duration: len, width: preset.w, height: preset.h, fps: 30 })} disabled={job?.status === "queued" || job?.status === "running"}>
              <Film /> Render {preset.label} ({len >= 60 ? `${Math.floor(len / 60)}:${String(Math.round(len % 60)).padStart(2, "0")}` : `${Math.round(len)} s`})
            </Button>
            <RenderJob job={job} projectId={id} onChange={onChange} vertical={preset.h > preset.w} />
            {cuts.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Rendered cuts</div>
                {cuts.map((c) => (
                  <a key={c.name} className="flex items-center gap-1.5 text-sm text-primary hover:underline" href={`/api/projects/${id}/files/renders/${c.name}.mp4?v=${Math.round(c.mtime)}`} download>
                    <Download className="h-3.5 w-3.5" /> {c.name}.mp4 <span className="text-xs text-muted-foreground">({(c.bytes / 1e6).toFixed(0)} MB)</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
