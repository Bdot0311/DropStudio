"use client";
import { use, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clapperboard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PreviewPlayer } from "@/components/video/preview-player";
import { RenderJob } from "@/components/video/render-job";
import { useVideoProps } from "@/hooks/use-video-props";
import { isJobActive, useRenders } from "@/hooks/use-renders";
import { fmtTime } from "@/lib/grid";
import { api, cn } from "@/lib/utils";

const RES = [
  { id: "1080", label: "1080p", w: 1920, h: 1080 },
  { id: "2160", label: "4K", w: 3840, h: 2160 },
];

export default function RenderStep({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: props, error } = useVideoProps(id);
  const { data: renders, mutate } = useRenders(id);
  const [res, setRes] = useState("1080");
  const [fps, setFps] = useState(30);
  const [debug, setDebug] = useState(false);
  const job = renders?.main;
  const busy = isJobActive(job);

  async function render() {
    const r = RES.find((x) => x.id === res)!;
    try {
      await api(`/api/projects/${id}/render`, { method: "POST", json: { kind: "main", width: r.w, height: r.h, fps, debug } });
      mutate();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (error) return <div className="p-10 text-center text-sm text-muted-foreground">{String(error.message)}. <Link className="text-primary underline" href={`/projects/${id}/analyze`}>Go to Analyze</Link></div>;

  const frames = props ? Math.ceil(props.map.duration * fps) : 0;



  return (
    <div className="grid gap-5 p-5 xl:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <h2 className="text-sm font-medium">Full preview</h2>
        {props ? <PreviewPlayer props={props} className="w-full" /> : <div className="grid aspect-video place-items-center rounded-lg border text-sm text-muted-foreground">Loading…</div>}
        {job?.status === "done" || busy || job?.status === "error" || job?.status === "cancelled" ? (
          <div className="space-y-2">
            <h2 className="text-sm font-medium">Rendered video</h2>
            <RenderJob job={job} projectId={id} onChange={() => mutate()} />
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Quality</CardTitle>
            <CardDescription className="text-xs">H.264 High, CRF 18, with your original audio encoded once as AAC 320 kbps.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Resolution</Label>
              <div className="grid grid-cols-2 gap-2">
                {RES.map((r) => (
                  <button key={r.id} onClick={() => setRes(r.id)} className={cn("cursor-pointer rounded-md border px-3 py-2 text-sm", res === r.id ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-accent")}>{r.label}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Frame rate</Label>
              <div className="grid grid-cols-2 gap-2">
                {[30, 60].map((f) => (
                  <button key={f} onClick={() => setFps(f)} className={cn("cursor-pointer rounded-md border px-3 py-2 text-sm", fps === f ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-accent")}>{f} fps</button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="dbg" className="text-xs font-normal">Burn in debug overlay (beat numbers)</Label>
              <Switch id="dbg" checked={debug} onCheckedChange={setDebug} />
            </div>
            {props && (
              <p className="text-xs text-muted-foreground">
                {fmtTime(props.map.duration)} · {frames.toLocaleString()} frames. Expect several minutes on an M-series Mac (more for 4K / 60 fps). Renders run in chunks: if anything stops, Retry picks up where it left off.
              </p>
            )}
            <Button className="w-full" size="lg" onClick={render} disabled={busy || !props}>
              <Clapperboard /> {busy ? "Rendering…" : job?.status === "done" ? "Render again" : "Render video"}
            </Button>
          </CardContent>
        </Card>
        <Button asChild variant="outline" className="w-full">
          <Link href={`/projects/${id}/publish`}>Continue to Publish <ArrowRight /></Link>
        </Button>
      </div>
    </div>
  );
}
