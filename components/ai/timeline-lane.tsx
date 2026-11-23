"use client";
import { useEffect, useRef } from "react";
import useSWR from "swr";
import { SECTION_COLORS, fmtTime } from "@/lib/grid";
import { fetcher } from "@/lib/utils";
import type { MusicMap } from "@/lib/types";
import type { Shot } from "@/lib/shots";
import { ShotThumb } from "./shot-card";

/** Waveform + section blocks, with a lane of shot thumbnails placed under the section each belongs to. */
export function TimelineLane({ projectId, shots, onAdd }: { projectId: string; shots: Shot[]; onAdd?: (sectionIndex: number) => void }) {
  const { data: map } = useSWR<MusicMap>(`/api/projects/${projectId}/music-map`, fetcher);
  const { data: peaks } = useSWR<{ data: number[] }>(`/api/projects/${projectId}/files/peaks.json`, fetcher);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !peaks || !map) return;
    const w = (c.width = c.clientWidth * 2);
    const h = (c.height = 96);
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    for (const s of map.sections) {
      ctx.fillStyle = SECTION_COLORS[s.type].fill;
      ctx.fillRect((s.start / map.duration) * w, 0, ((s.end - s.start) / map.duration) * w, h);
    }
    ctx.fillStyle = "#71717a";
    const n = peaks.data.length;
    for (let x = 0; x < w; x += 2) {
      const a = Math.floor((x / w) * n), b = Math.floor(((x + 2) / w) * n);
      let m = 0;
      for (let i = a; i < b; i++) m = Math.max(m, peaks.data[i]);
      const bh = Math.max(1, m * h * 0.9);
      ctx.fillRect(x, (h - bh) / 2, 1.5, bh);
    }
  }, [peaks, map]);

  if (!map) return <div className="h-40 rounded-lg border" />;
  return (
    <div className="rounded-lg border bg-card p-3">
      <canvas ref={canvas} className="h-12 w-full rounded" />
      <div className="relative mt-2 flex gap-px">
        {map.sections.map((s, i) => {
          const own = shots.filter((x) => x.section_index === i && x.status !== "rejected");
          return (
            <div key={i} className="min-w-0 border-t-2 pt-1.5" style={{ width: `${((s.end - s.start) / map.duration) * 100}%`, borderColor: SECTION_COLORS[s.type].solid }}>
              <div className="mb-1 truncate text-[10px] uppercase tracking-wide text-muted-foreground">{s.type} · {fmtTime(s.start)}</div>
              <div className="flex flex-wrap gap-1">
                {own.map((shot) => <ShotThumb key={shot.id} shot={shot} className="w-14" />)}
                {onAdd && (
                  <button onClick={() => onAdd(i)} className="grid aspect-video w-8 cursor-pointer place-items-center rounded border border-dashed text-xs text-muted-foreground hover:text-foreground" title="Add a shot to this section">+</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
