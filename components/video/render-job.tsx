"use client";
import { AlertTriangle, Download, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/utils";
import type { Job } from "@/lib/types";

type Result = { output: string; frames: number; fps: number; width: number; height: number; bytes: number; seconds: number; video_seconds: number; audio_seconds: number | null };

/** Progress / error / result for one render job. */
export function RenderJob({ job, projectId, onChange, vertical }: { job: Job | null | undefined; projectId: string; onChange: () => void; vertical?: boolean }) {
  if (!job) return null;
  if (job.status === "queued" || job.status === "running") {
    const stale = job.status === "queued" && Date.now() - Date.parse(job.created_at) > 10000;
    return (
      <div className="space-y-2 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-3">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <div className="min-w-0 flex-1 truncate text-sm">{job.status === "queued" ? "Waiting for the render worker…" : job.message}</div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{Math.round(job.progress * 100)}%</span>
          <Button size="sm" variant="ghost" onClick={async () => { await api(`/api/jobs/${job.id}/cancel`, { method: "POST" }); onChange(); }}>
            <X /> Cancel
          </Button>
        </div>
        <Progress value={job.progress} />
        {stale && <p className="text-xs text-warning">The render worker hasn&apos;t started this yet. Is <code>npm run dev</code> running?</p>}
      </div>
    );
  }
  if (job.status === "error" || job.status === "cancelled") {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-card p-4">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <div className="min-w-0 flex-1 text-sm">
          {job.status === "cancelled" ? "Render cancelled." : "Render failed."}
          {job.error && <div className="mt-1 text-xs text-muted-foreground">{job.error}</div>}
        </div>
        <Button size="sm" variant="outline" onClick={async () => { await api(`/api/jobs/${job.id}/retry`, { method: "POST" }); onChange(); }}>
          <RefreshCw /> {job.status === "cancelled" ? "Resume" : "Retry"}
        </Button>
      </div>
    );
  }
  const r = job.result as Result | null;
  if (!r) return null;
  const url = `/api/projects/${projectId}/files/${r.output}?v=${Date.parse(job.finished_at ?? job.created_at)}`;
  return (
    <div className="space-y-2">
      <video src={url} controls className={vertical ? "mx-auto max-h-[70vh] rounded-lg bg-black" : "w-full rounded-lg bg-black"} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{r.width}×{r.height} · {r.fps} fps · {(r.bytes / 1e6).toFixed(0)} MB</span>
        <span>rendered in {Math.floor(r.seconds / 60)}m {r.seconds % 60}s</span>
        {r.audio_seconds !== null && <span>audio/video length match: {Math.abs(r.video_seconds - r.audio_seconds) < 1.5 / r.fps ? "✓" : "⚠"}</span>}
        <a className="ml-auto inline-flex items-center gap-1 text-primary hover:underline" href={url} download>
          <Download className="h-3.5 w-3.5" /> Download
        </a>
      </div>
    </div>
  );
}
