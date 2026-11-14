"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/plugins/regions";
import TimelinePlugin from "wavesurfer.js/plugins/timeline";
import { SECTION_COLORS, nearestIndex } from "@/lib/grid";
import type { Section } from "@/lib/types";

export type WaveformHandle = {
  ws: () => WaveSurfer | null;
  playPause: () => void;
  seek: (t: number) => void;
  playFrom: (t: number) => void;
  time: () => number;
};

type Props = {
  audioUrl: string;
  peaks: number[];
  duration: number;
  sections: Section[];
  downbeats: number[];
  phraseStarts: number[];
  selected: number | null;
  zoom: number;
  onSelect: (i: number) => void;
  /** A section edge was dragged: boundary between section i-1 and i moved to `t` (unsnapped). */
  onBoundaryMove: (index: number, t: number) => void;
  onPlayState: (playing: boolean) => void;
  onReady?: () => void;
};

export const WaveformEditor = forwardRef<WaveformHandle, Props>(function WaveformEditor(props, ref) {
  const container = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  // Latest props for event handlers registered once.
  const latest = useRef(props);
  latest.current = props;

  useImperativeHandle(ref, () => ({
    ws: () => wsRef.current,
    playPause: () => wsRef.current?.playPause(),
    seek: (t) => {
      const ws = wsRef.current;
      if (ws) ws.setTime(Math.max(0, Math.min(t, ws.getDuration() - 0.01)));
    },
    playFrom: (t) => {
      const ws = wsRef.current;
      if (!ws) return;
      ws.setTime(Math.max(0, t));
      ws.play();
    },
    time: () => wsRef.current?.getCurrentTime() ?? 0,
  }));

  // Create wavesurfer once per audio file.
  useEffect(() => {
    if (!container.current) return;
    const regions = RegionsPlugin.create();
    const ws = WaveSurfer.create({
      container: container.current,
      height: 168,
      waveColor: "#3f3f46",
      progressColor: "#a1a1aa",
      cursorColor: "#fafafa",
      cursorWidth: 1,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      url: props.audioUrl,
      peaks: [props.peaks],
      duration: props.duration,
      minPxPerSec: props.zoom,
      dragToSeek: true,
      autoScroll: true,
      autoCenter: false,
      plugins: [
        regions,
        TimelinePlugin.create({ height: 18, timeInterval: 5, primaryLabelInterval: 30, style: { color: "#71717a", fontSize: "10px" } }),
      ],
    });
    wsRef.current = ws;
    regionsRef.current = regions;

    ws.on("ready", () => {
      setReady(true);
      latest.current.onReady?.();
    });
    ws.on("play", () => latest.current.onPlayState(true));
    ws.on("pause", () => latest.current.onPlayState(false));
    ws.on("finish", () => latest.current.onPlayState(false));
    regions.on("region-clicked", (region, e) => {
      e.stopPropagation();
      latest.current.onSelect(Number(region.id));
      // Clicking also seeks there, like clicking anywhere on the waveform.
      const ws = wsRef.current;
      if (ws && container.current) {
        const wrapper = ws.getWrapper();
        const rect = wrapper.getBoundingClientRect();
        ws.setTime(((e.clientX - rect.left) / rect.width) * ws.getDuration());
      }
    });
    regions.on("region-updated", (region, side) => {
      const i = Number(region.id);
      const s = latest.current.sections[i];
      if (!s) return;
      if (side === "start" || (side === undefined && Math.abs(region.start - s.start) > 1e-3)) latest.current.onBoundaryMove(i, region.start);
      else latest.current.onBoundaryMove(i + 1, region.end);
    });

    // Bar/phrase grid overlay lives inside the scrolling wrapper so it zooms with the waveform.
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:2";
    ws.getWrapper().appendChild(overlay);
    overlayRef.current = overlay;

    return () => {
      ws.destroy();
      wsRef.current = null;
      regionsRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.audioUrl]);

  // Zoom
  useEffect(() => {
    // 0 = fit the whole track in view
    if (ready) wsRef.current?.setOptions({ minPxPerSec: props.zoom });
  }, [props.zoom, ready]);

  // Sections -> regions
  useEffect(() => {
    const regions = regionsRef.current;
    if (!regions) return;
    regions.clearRegions();
    props.sections.forEach((s, i) => {
      const c = SECTION_COLORS[s.type];
      const label = document.createElement("span");
      // wavesurfer renders inside a shadow DOM, so page CSS doesn't apply: style inline.
      label.style.cssText = `position:absolute;top:6px;left:6px;padding:2px 8px;border-radius:999px;background:${c.solid};color:#0a0a0a;font:600 10px/1.5 ui-sans-serif,-apple-system,sans-serif;letter-spacing:.06em;text-transform:uppercase;pointer-events:none;white-space:nowrap`;
      label.textContent = s.type;
      const r = regions.addRegion({
        id: String(i),
        start: s.start,
        end: s.end,
        color: c.fill,
        drag: false,
        resize: true,
        content: label,
        minLength: 0.5,
      });
      r.element?.style.setProperty("border-left", `2px solid ${c.solid}`);
      if (props.selected === i) {
        r.element?.style.setProperty("box-shadow", `inset 0 0 0 2px ${c.solid}`);
      }
    });
  }, [props.sections, props.selected, ready]);

  // Grid overlay
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !props.duration) return;
    const phraseSet = new Set(props.phraseStarts.map((t) => t.toFixed(3)));
    const html: string[] = [];
    for (const d of props.downbeats) {
      const phrase = phraseSet.has(d.toFixed(3));
      const left = (d / props.duration) * 100;
      html.push(
        `<div style="position:absolute;top:0;bottom:0;left:${left}%;width:1px;background:${phrase ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.07)"}"></div>`
      );
    }
    overlay.innerHTML = html.join("");
  }, [props.downbeats, props.phraseStarts, props.duration, ready]);

  return (
    <div className="relative">
      <div ref={container} className="rounded-md bg-black/40" />
      {!ready && <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">Loading audio…</div>}
    </div>
  );
});

/** Plays a metronome click on every beat (accent on downbeats) in sync with wavesurfer playback. */
export function useClickTrack(getWs: () => WaveSurfer | null, beats: number[], downbeats: number[], enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const downSet = new Set(downbeats.map((d) => d.toFixed(3)));
    const scheduled = new Set<number>();
    let lastT = -1;
    let stopped = false;

    const click = (at: number, accent: boolean) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = accent ? 1760 : 1100;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, at + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.05);
    };

    const tick = () => {
      if (stopped) return;
      const ws = getWs();
      if (ws && ws.isPlaying()) {
        if (ctx.state === "suspended") ctx.resume();
        const t = ws.getCurrentTime();
        if (Math.abs(t - lastT) > 0.3) scheduled.clear(); // seek
        lastT = t;
        const rate = ws.getPlaybackRate();
        let i = Math.max(0, nearestIndex(beats, t) - 1);
        for (; i < beats.length && beats[i] < t + 0.15; i++) {
          if (beats[i] >= t - 0.002 && !scheduled.has(i)) {
            scheduled.add(i);
            click(ctx.currentTime + (beats[i] - t) / rate, downSet.has(beats[i].toFixed(3)));
          }
        }
      } else {
        scheduled.clear();
        lastT = -1;
      }
      setTimeout(tick, 20);
    };
    tick();
    return () => {
      stopped = true;
      ctx.close();
    };
  }, [enabled, beats, downbeats, getWs]);
}
