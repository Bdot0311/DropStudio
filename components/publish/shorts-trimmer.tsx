"use client";
import { useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin, { type Region } from "wavesurfer.js/plugins/regions";
import { snap } from "@/lib/grid";

/** Waveform with one draggable window for the Shorts cut; edges snap to bar lines, length kept within 15–45 s. */
export function ShortsTrimmer({
  audioUrl, peaks, duration, downbeats, dropAt, value, onChange,
}: {
  audioUrl: string; peaks: number[]; duration: number; downbeats: number[]; dropAt: number;
  value: { start: number; end: number }; onChange: (v: { start: number; end: number }) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const region = useRef<Region | null>(null);
  const latest = useRef({ value, onChange, downbeats });
  latest.current = { value, onChange, downbeats };

  useEffect(() => {
    if (!el.current) return;
    const regions = RegionsPlugin.create();
    const ws = WaveSurfer.create({
      container: el.current, height: 90, waveColor: "#3f3f46", progressColor: "#a1a1aa", cursorColor: "#fafafa",
      barWidth: 2, barGap: 1, url: audioUrl, peaks: [peaks], duration, plugins: [regions], dragToSeek: true,
    });
    const r = regions.addRegion({ start: value.start, end: value.end, color: "rgba(232,121,249,0.22)", drag: true, resize: true });
    region.current = r;
    const marker = document.createElement("div");
    marker.style.cssText = `position:absolute;top:0;bottom:0;left:${(dropAt / duration) * 100}%;width:2px;background:#f43f5e;z-index:3;pointer-events:none`;
    ws.getWrapper().appendChild(marker);
    regions.on("region-updated", (reg) => {
      const { downbeats: db, onChange: cb } = latest.current;
      let s = snap(db, reg.start);
      let e = snap(db, reg.end);
      if (e - s < 15) e = snap(db, s + 15.5);
      if (e - s > 45) e = snap(db, s + 44.5);
      if (e - s > 45 || e - s < 15) e = s + Math.min(45, Math.max(15, e - s));
      e = Math.min(e, duration);
      reg.setOptions({ start: s, end: e });
      cb({ start: s, end: e });
    });
    regions.on("region-clicked", (reg, ev) => { ev.stopPropagation(); ws.setTime(reg.start); ws.play(); });
    return () => ws.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  useEffect(() => {
    const r = region.current;
    if (r && (Math.abs(r.start - value.start) > 1e-3 || Math.abs(r.end - value.end) > 1e-3)) r.setOptions({ start: value.start, end: value.end });
  }, [value]);

  return <div ref={el} className="rounded-md bg-black/40" />;
}
