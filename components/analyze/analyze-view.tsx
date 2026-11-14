"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  AlertTriangle, ArrowRight, Combine, Flag, Loader2, Pause, Play, RefreshCw, RotateCcw, Save, Scissors, Trash2, X, ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { WaveformEditor, useClickTrack, type WaveformHandle } from "./waveform-editor";
import { isActive, useProject } from "@/hooks/use-project";
import { SECTION_COLORS, barBeat, fmtTime, nearestIndex, normalizeSections, phrasesFromSections, regridDownbeats, snap } from "@/lib/grid";
import { api, cn, fetcher } from "@/lib/utils";
import { SECTION_TYPES, type Job, type MusicMap, type Section } from "@/lib/types";

export function AnalyzeView({ id }: { id: string }) {
  const { data, mutate } = useProject(id);
  const job = data?.analyzeJob ?? null;
  const active = isActive(job);
  const { data: map, mutate: mutateMap } = useSWR<MusicMap>(data?.hasMusicMap && !active ? `/api/projects/${id}/music-map` : null, fetcher);
  const { data: peaks } = useSWR<{ data: number[] }>(
    data?.hasMusicMap && !active ? `/api/projects/${id}/files/peaks.json?v=${map?.analysis.seconds ?? 0}` : null,
    fetcher
  );

  // Refresh the map once the job finishes.
  const prevActive = useRef(active);
  useEffect(() => {
    if (prevActive.current && !active) mutateMap();
    prevActive.current = active;
  }, [active, mutateMap]);

  if (!data) return null;
  const { project } = data;

  if (!project.audio_file) {
    return (
      <div className="mx-auto max-w-lg p-10 text-center">
        <p className="font-medium">No track yet</p>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">Upload your track first and analysis will start automatically.</p>
        <Button asChild>
          <Link href={`/projects/${id}/upload`}>Go to Upload</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-5">
      {active && job && <JobProgress job={job} onCancel={() => mutate()} />}
      {!active && job?.status === "error" && <JobError job={job} onRetry={() => mutate()} hasMap={data.hasMusicMap} />}
      {!active && !data.hasMusicMap && job?.status !== "error" && (
        <Card>
          <CardHeader>
            <CardTitle>Ready to analyze</CardTitle>
            <CardDescription>Finds BPM, key, beats, downbeats, and your intro, build, drop, breakdown and outro.</CardDescription>
          </CardHeader>
          <CardContent>
            <AnalyzeButton id={id} onStarted={() => mutate()} />
          </CardContent>
        </Card>
      )}
      {!active && map && peaks && project.playback_file && (
        <Editor
          key={`${map.analysis.seconds}-${map.analysis.first_downbeat}`}
          id={id}
          map={map}
          peaks={peaks.data}
          audioUrl={`/api/projects/${id}/files/${project.playback_file}`}
          onSaved={(m) => mutateMap(m, { revalidate: false })}
          onReanalyze={() => mutate()}
        />
      )}
    </div>
  );
}

function JobProgress({ job, onCancel }: { job: Job; onCancel: () => void }) {
  const stale = job.status === "queued" && Date.now() - Date.parse(job.created_at) > 8000;
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{job.type === "make_fixture" ? "Creating the test track" : "Analyzing your track"}</div>
            <div className="truncate text-xs text-muted-foreground">{job.status === "queued" ? "Waiting for the worker…" : job.message}</div>
          </div>
          <span className="font-mono text-sm tabular-nums text-muted-foreground">{Math.round(job.progress * 100)}%</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await api(`/api/jobs/${job.id}/cancel`, { method: "POST" });
              onCancel();
            }}
          >
            <X /> Cancel
          </Button>
        </div>
        <Progress value={job.progress} />
        {stale && (
          <p className="flex items-center gap-2 text-xs text-warning">
            <AlertTriangle className="h-3.5 w-3.5" /> The analysis worker hasn&apos;t picked this up yet. Is <code>npm run dev</code> running? Check the{" "}
            <Link href="/health" className="underline">
              Health page
            </Link>
            .
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function JobError({ job, onRetry, hasMap }: { job: Job; onRetry: () => void; hasMap: boolean }) {
  return (
    <Card className="border-destructive/40">
      <CardContent className="flex flex-wrap items-center gap-3 pt-5">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Analysis failed{hasMap ? " (showing the previous result)" : ""}</div>
          <div className="text-xs text-muted-foreground">{job.error}</div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await api(`/api/jobs/${job.id}/retry`, { method: "POST" });
            onRetry();
          }}
        >
          <RefreshCw /> Retry
        </Button>
      </CardContent>
    </Card>
  );
}

function AnalyzeButton({ id, onStarted, firstDownbeat, label = "Analyze track" }: { id: string; onStarted: () => void; firstDownbeat?: number; label?: string }) {
  const { data: health } = useSWR<{ checks: { id: string; status: string }[] }>("/api/health", fetcher);
  const stemsReady = health?.checks.some((c) => c.id === "stems" && c.status === "ok");
  const [stems, setStems] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api(`/api/projects/${id}/analyze`, { method: "POST", json: { stems, first_downbeat: firstDownbeat } });
            onStarted();
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <RefreshCw /> {label}
      </Button>
      <div className="flex items-center gap-2" title={stemsReady ? "" : "Install with: npm run setup -- --with-stems"}>
        <Switch id="stems" checked={stems} onCheckedChange={setStems} disabled={!stemsReady} />
        <Label htmlFor="stems" className={cn("text-xs", !stemsReady && "text-muted-foreground")}>
          Stem separation (Demucs){!stemsReady && " · not installed"}
        </Label>
      </div>
    </div>
  );
}

const ZOOMS = [0, 20, 40, 80, 160]; // px per second; 0 = whole track

function Editor({
  id, map, peaks, audioUrl, onSaved, onReanalyze,
}: { id: string; map: MusicMap; peaks: number[]; audioUrl: string; onSaved: (m: MusicMap) => void; onReanalyze: () => void }) {
  const wf = useRef<WaveformHandle>(null);
  const [sections, setSections] = useState<Section[]>(map.sections);
  const [downbeats, setDownbeats] = useState<number[]>(map.downbeats);
  const [manualDownbeat, setManualDownbeat] = useState<number | undefined>(undefined);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [clickOn, setClickOn] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(0);
  const [saving, setSaving] = useState(false);

  const phraseStarts = useMemo(() => phrasesFromSections(sections, downbeats).map((p) => p.start), [sections, downbeats]);
  const drops = useMemo(() => sections.filter((s) => s.type === "drop").map((s) => s.start), [sections]);
  const getWs = useCallback(() => wf.current?.ws() ?? null, []);
  useClickTrack(getWs, map.beats, downbeats, clickOn);

  const edit = (next: Section[]) => {
    setSections(normalizeSections(next, downbeats, map.duration));
    setDirty(true);
  };

  const onBoundaryMove = (i: number, t: number) => {
    if (i <= 0 || i >= sections.length) {
      edit([...sections]); // start of track / end of track are fixed; just re-render
      return;
    }
    const lo = sections[i - 1].start;
    const hi = sections[i].end;
    let b = snap(downbeats, t);
    const bar = (map.downbeats[1] ?? 2) - (map.downbeats[0] ?? 0);
    b = Math.max(lo + bar * 0.99, Math.min(b, hi - bar * 0.99));
    b = snap(downbeats, b);
    const next = sections.map((s) => ({ ...s }));
    next[i].start = b;
    next[i - 1].end = b;
    edit(next);
  };

  const splitAtPlayhead = () => {
    const t = snap(downbeats, wf.current?.time() ?? 0);
    const i = sections.findIndex((s) => t > s.start + 0.01 && t < s.end - 0.01);
    if (i < 0) {
      toast.message("Move the playhead inside a section (not on a boundary) to split it.");
      return;
    }
    const next = [...sections.slice(0, i), { ...sections[i], end: t }, { ...sections[i], start: t }, ...sections.slice(i + 1)];
    edit(next);
    setSelected(i + 1);
  };

  const mergeWithNext = (i: number) => {
    if (i >= sections.length - 1) return;
    const next = [...sections];
    next.splice(i, 2, { ...sections[i], end: sections[i + 1].end });
    edit(next);
  };

  const removeSection = (i: number) => {
    if (sections.length < 2) return;
    const next = [...sections];
    if (i === 0) next.splice(0, 2, { ...sections[1], start: 0 });
    else next.splice(i - 1, 2, { ...sections[i - 1], end: sections[i].end });
    edit(next);
    setSelected(null);
  };

  const setLabel = (i: number, type: Section["type"]) => edit(sections.map((s, j) => (j === i ? { ...s, type } : s)));

  const setDownbeatHere = () => {
    const t = wf.current?.time() ?? 0;
    const beat = map.beats[nearestIndex(map.beats, t)];
    const db = regridDownbeats(map.beats, beat);
    setDownbeats(db);
    setManualDownbeat(beat);
    setSections(normalizeSections(sections, db, map.duration));
    setDirty(true);
    toast.success(`Bar 1 now starts on the beat at ${fmtTime(beat)}. Save to keep it.`);
  };

  const save = async () => {
    setSaving(true);
    try {
      const m = await api<MusicMap>(`/api/projects/${id}/music-map`, {
        method: "PUT",
        json: { sections: sections.map(({ start, end, type, energy }) => ({ start, end, type, energy })), first_downbeat: manualDownbeat },
      });
      onSaved(m);
      setSections(m.sections);
      setDownbeats(m.downbeats);
      setManualDownbeat(undefined);
      setDirty(false);
      toast.success("Music map saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setSections(map.sections);
    setDownbeats(map.downbeats);
    setManualDownbeat(undefined);
    setDirty(false);
  };

  // Keyboard shortcuts: space = play/pause, ←/→ = jump a bar (shift: a 16-bar phrase).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable || el.getAttribute("role") === "combobox")) return;
      if (e.code === "Space") {
        e.preventDefault();
        wf.current?.playPause();
      } else if (e.code === "ArrowRight" || e.code === "ArrowLeft") {
        e.preventDefault();
        const t = wf.current?.time() ?? 0;
        const step = e.shiftKey ? 16 : 1;
        let i = nearestIndex(downbeats, t);
        if (e.code === "ArrowRight") {
          if (downbeats[i] <= t + 0.05) i += step;
          else i += step - 1;
        } else {
          if (downbeats[i] >= t - 0.25) i -= step;
          else i -= step - 1;
        }
        i = Math.max(0, Math.min(downbeats.length - 1, i));
        wf.current?.seek(downbeats[i]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [downbeats]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const sel = selected !== null ? sections[selected] : null;
  const a = map.analysis;
  const biggestDrop = sections.filter((s) => s.type === "drop").sort((x, y) => y.energy - x.energy)[0];

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Stat label="BPM" value={map.bpm.toFixed(map.bpm % 1 ? 2 : 0)} sub={a.constant_tempo ? `grid locked · ${Math.round(a.beat_confidence * 100)}% conf.` : "variable tempo"} />
        <Stat label="Key" value={map.key ?? "—"} sub={map.camelot ? `Camelot ${map.camelot}` : undefined} />
        <Stat label="Length" value={fmtTime(map.duration)} sub={`${downbeats.length} bars`} />
        <Stat label="Sections" value={String(sections.length)} sub={`${drops.length} drop${drops.length === 1 ? "" : "s"}`} />
        <Stat label="Bar 1" value={fmtTime(downbeats[0] ?? 0) + "." + String(Math.round(((downbeats[0] ?? 0) % 1) * 1000)).padStart(3, "0").slice(0, 2)} sub={a.manual_downbeat || manualDownbeat !== undefined ? "set by hand" : "auto-detected"} />
        <Stat label="Engine" value={a.engine} sub={`${a.seconds}s${a.stems ? " · stems" : ""}`} />
      </div>

      {a.notes.length > 0 && (
        <div className="flex gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div>{a.notes.join(" ")}</div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon" onClick={() => wf.current?.playPause()} title="Play / pause (space)">
          {playing ? <Pause /> : <Play />}
        </Button>
        <TimeReadout getWs={getWs} beats={map.beats} downbeats={downbeats} />
        <div className="mx-2 h-6 w-px bg-border" />
        <div className="flex items-center gap-2">
          <Switch id="click" checked={clickOn} onCheckedChange={setClickOn} />
          <Label htmlFor="click" className="text-xs">Click track</Label>
        </div>
        <Button size="sm" variant="outline" onClick={setDownbeatHere} title="If the bar numbers are off, play to the real '1' and press this">
          <Flag /> Set bar 1 here
        </Button>
        <Button size="sm" variant="outline" onClick={splitAtPlayhead} title="Split the section under the playhead at the nearest bar line">
          <Scissors /> Split at playhead
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <ZoomIn className="h-4 w-4 text-muted-foreground" />
          <input
            type="range"
            min={0}
            max={ZOOMS.length - 1}
            value={zoomIdx}
            onChange={(e) => setZoomIdx(Number(e.target.value))}
            className="w-24 accent-[var(--color-primary)]"
            title="Zoom"
          />
          {dirty && (
            <Button size="sm" variant="ghost" onClick={discard}>
              <RotateCcw /> Discard
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} {dirty ? "Save changes" : "Saved"}
          </Button>
        </div>
      </div>

      <WaveformEditor
        ref={wf}
        audioUrl={audioUrl}
        peaks={peaks}
        duration={map.duration}
        sections={sections}
        downbeats={downbeats}
        phraseStarts={phraseStarts}
        selected={selected}
        zoom={ZOOMS[zoomIdx]}
        onSelect={setSelected}
        onBoundaryMove={onBoundaryMove}
        onPlayState={setPlaying}
      />
      <p className="text-xs text-muted-foreground">
        Drag a section&apos;s edge to move a boundary (it snaps to the nearest bar). Click a section to relabel it. Bright lines mark 16-bar phrases.
        <span className="ml-2 hidden md:inline">
          <Kbd>Space</Kbd> play/pause · <Kbd>←</Kbd>/<Kbd>→</Kbd> jump a bar · <Kbd>Shift</Kbd>+<Kbd>←</Kbd>/<Kbd>→</Kbd> jump a phrase
        </span>
      </p>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Section list */}
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Sections</CardTitle>
            {biggestDrop && (
              <button className="cursor-pointer text-xs text-muted-foreground hover:text-foreground" onClick={() => wf.current?.playFrom(Math.max(0, biggestDrop.start - 4 * (60 / map.bpm) * 2))}>
                ▶ Hear the biggest drop
              </button>
            )}
          </CardHeader>
          <CardContent className="p-2 pt-0">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-normal">Section</th>
                  <th className="px-3 py-2 font-normal">Starts</th>
                  <th className="px-3 py-2 font-normal">Bar</th>
                  <th className="px-3 py-2 font-normal">Length</th>
                  <th className="px-3 py-2 font-normal">Energy</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sections.map((s, i) => {
                  const bar = downbeats.findIndex((d) => Math.abs(d - s.start) < 0.01) + 1;
                  return (
                    <tr
                      key={`${i}-${s.start}`}
                      onClick={() => {
                        setSelected(i);
                        wf.current?.seek(s.start);
                      }}
                      className={cn("cursor-pointer border-t hover:bg-accent/50", selected === i && "bg-accent")}
                    >
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2 capitalize">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: SECTION_COLORS[s.type].solid }} />
                          {s.type}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums">{fmtTime(s.start)}</td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums">{bar > 0 ? bar : "pickup"}</td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums">{s.bars ?? "?"} bars</td>
                      <td className="px-3 py-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
                          <div className="h-full rounded-full" style={{ width: `${Math.round(s.energy * 100)}%`, background: SECTION_COLORS[s.type].solid }} />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
                          title="Play from here"
                          onClick={(e) => {
                            e.stopPropagation();
                            wf.current?.playFrom(s.start);
                          }}
                        >
                          <Play className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Selected section panel + re-analyze */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{sel ? "Edit section" : "Select a section"}</CardTitle>
              {!sel && <CardDescription className="text-xs">Click a colored region or a row in the list.</CardDescription>}
            </CardHeader>
            {sel && selected !== null && (
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-1.5">
                  {SECTION_TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setLabel(selected, t)}
                      className={cn(
                        "cursor-pointer rounded-md border px-2 py-1.5 text-xs capitalize transition-colors",
                        sel.type === t ? "border-transparent font-semibold text-black" : "hover:bg-accent"
                      )}
                      style={sel.type === t ? { background: SECTION_COLORS[t].solid } : undefined}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">
                  {fmtTime(sel.start)} → {fmtTime(sel.end)} · {sel.bars} bars · energy {Math.round(sel.energy * 100)}%
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => wf.current?.playFrom(sel.start)}>
                    <Play /> Play from here
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => mergeWithNext(selected)} disabled={selected >= sections.length - 1}>
                    <Combine /> Merge with next
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => removeSection(selected)} disabled={sections.length < 2}>
                    <Trash2 /> Remove
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Re-analyze</CardTitle>
              <CardDescription className="text-xs">
                Runs the analysis again{a.manual_downbeat ? ", keeping your bar 1" : ""}. Your edits are kept as a backup (music_map.prev.json).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AnalyzeButton id={id} onStarted={onReanalyze} label="Re-analyze" firstDownbeat={a.manual_downbeat ? a.first_downbeat : undefined} />
            </CardContent>
          </Card>

          <Button asChild variant="outline" className="w-full">
            <Link href={`/projects/${id}/style`}>
              Continue to Style <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-lg font-semibold">{value}</div>
      {sub && <div className="truncate text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-secondary px-1 py-px font-mono text-[10px]">{children}</kbd>;
}

function TimeReadout({ getWs, beats, downbeats }: { getWs: () => ReturnType<WaveformHandle["ws"]>; beats: number[]; downbeats: number[] }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const ws = getWs();
      if (ws) setT(ws.getCurrentTime());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [getWs]);
  const { bar, beat } = barBeat(beats, downbeats, t);
  return (
    <div className="flex items-baseline gap-3 rounded-md border px-3 py-1.5 font-mono text-sm tabular-nums">
      <span>
        {fmtTime(t)}.{String(Math.floor((t % 1) * 10))}
      </span>
      <span className="text-muted-foreground">
        bar <span className="text-foreground">{bar || "—"}</span>.{beat || "—"}
      </span>
    </div>
  );
}
