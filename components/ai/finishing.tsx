"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Loader2, Maximize2, Scissors, Shuffle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ConfirmSpend } from "@/components/ai/confirm-spend";
import { api, fetcher } from "@/lib/utils";
import type { Job } from "@/lib/types";

type Pass = { done: number; total: number; pending: number; cost: number; model: string | null; unavailable: string | null };
type Payload = { passes: Record<"bridge" | "upscale" | "matte", Pass>; style: { morph: string; textBehind: boolean }; job: Job | null };
const active = (j: Job | null) => !!j && (j.status === "queued" || j.status === "running");

const PASSES = [
  { kind: "bridge" as const, icon: Shuffle, title: "AI morph transitions", text: "Each section change melts from one shot into the next over 2 bars, landing on the drop (Wan 2.2 first→last frame)." },
  { kind: "upscale" as const, icon: Maximize2, title: "Upscale draft clips to 1080p", text: "Sharpens low-resolution clips with SeedVR2, so Draft-tier footage holds up in a 1080p video." },
  { kind: "matte" as const, icon: Scissors, title: "Captions behind you", text: "Cuts the subject out of every clip, so the drop text sits behind you (BiRefNet)." },
];

/** Paid finishing passes on top of the clips; each has a confirm dialog with the estimate. */
export function FinishingCard({ projectId, onDone }: { projectId: string; onDone?: () => void }) {
  const { data, mutate } = useSWR<Payload>(`/api/projects/${projectId}/enhance`, fetcher, { refreshInterval: (d) => (active(d?.job ?? null) ? 1500 : 0) });
  const [confirm, setConfirm] = useState<"bridge" | "upscale" | "matte" | null>(null);
  if (!data) return null;
  const job = data.job;
  const styleOn = { bridge: data.style.morph !== "off", upscale: true, matte: data.style.textBehind };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Finishing touches</CardTitle>
        <CardDescription className="text-xs">Optional passes on top of your clips. Each shows its cost first; finished ones are cached and never billed twice.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {active(job) && (
          <div className="space-y-1.5 rounded-md border p-2.5">
            <div className="flex items-center gap-2 text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> {job!.status === "queued" ? "Waiting for the worker…" : job!.message}
              <Button size="sm" variant="ghost" className="ml-auto h-6 px-2" onClick={async () => { await api(`/api/jobs/${job!.id}/cancel`, { method: "POST" }); mutate(); }}><X /></Button>
            </div>
            <Progress value={job!.progress} />
          </div>
        )}
        {job?.status === "error" && <p className="text-[11px] text-destructive">Last pass failed: {job.error}</p>}
        {PASSES.map(({ kind, icon: Icon, title, text }) => {
          const p = data.passes[kind];
          return (
            <div key={kind} className="space-y-1.5 rounded-md border p-2.5">
              <div className="flex items-center gap-2 text-xs font-medium"><Icon className="h-3.5 w-3.5 text-primary" /> {title}
                {p.total > 0 && <span className="ml-auto font-normal text-muted-foreground">{p.done}/{p.total} done</span>}
              </div>
              <p className="text-[11px] text-muted-foreground">{text}</p>
              {p.unavailable ? (
                <p className="text-[11px] text-warning">{p.unavailable}</p>
              ) : (
                <>
                  {!styleOn[kind] && (
                    <p className="text-[11px] text-warning">
                      Switched off in <Link href={`/projects/${projectId}/style`} className="underline">Style</Link> ({kind === "bridge" ? "AI morph transitions" : "Captions behind you"}). You can make them now and switch it on later.
                    </p>
                  )}
                  <Button size="sm" variant="secondary" className="w-full" disabled={!p.pending || active(job)} onClick={() => setConfirm(kind)}>
                    {p.pending ? `Make ${p.pending} (~$${p.cost.toFixed(2)})` : p.total ? "All done" : kind === "bridge" ? "Needs AI clips on both sides of a section change" : kind === "upscale" ? "Clips are already sharp" : "No clips yet"}
                  </Button>
                </>
              )}
            </div>
          );
        })}
      </CardContent>
      <ConfirmSpend open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} projectId={projectId} kind={confirm ?? "bridge"} onStarted={() => { mutate(); onDone?.(); }} />
    </Card>
  );
}
