"use client";
import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PreviewPlayer } from "@/components/video/preview-player";
import { biggestDrop, useVideoProps } from "@/hooks/use-video-props";
import { useProject } from "@/hooks/use-project";
import { PRESETS } from "@/lib/presets";
import { DEFAULT_STYLE, type StyleConfig } from "@/lib/presets/configs";
import { api, cn, fetcher } from "@/lib/utils";
import type { RenderMode } from "@/lib/types";

const MODES: { id: RenderMode; name: string; desc: string }[] = [
  { id: "visualizer", name: "A · Visualizer", desc: "Free. Audio-reactive shader scenes." },
  { id: "montage", name: "B · AI montage", desc: "AI clips cut to your track." },
  { id: "hybrid", name: "C · Hybrid", desc: "AI on drops and builds, shaders elsewhere." },
];

export default function StyleStep({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: proj, mutate: mutateProject } = useProject(id);
  const { data: server, mutate } = useSWR<{ style: StyleConfig; mode: RenderMode; preset: string }>(`/api/projects/${id}/style`, fetcher);
  const { data: props, mutate: mutateProps } = useVideoProps(id);
  const [style, setStyle] = useState<StyleConfig>(DEFAULT_STYLE);
  const [mode, setMode] = useState<RenderMode>("hybrid");
  const [preset, setPreset] = useState("melodic");
  const [saving, setSaving] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (server && !loaded.current) {
      setStyle(server.style);
      setMode(server.mode);
      setPreset(server.preset);
      loaded.current = true;
    }
  }, [server]);

  // Debounced autosave.
  useEffect(() => {
    if (!loaded.current) return;
    setSaving(true);
    const h = setTimeout(async () => {
      try {
        const r = await api<{ style: StyleConfig; mode: RenderMode; preset: string }>(`/api/projects/${id}/style`, { method: "PUT", json: { style, mode, preset } });
        mutate(r, { revalidate: false });
        mutateProject();
        mutateProps();
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setSaving(false);
      }
    }, 500);
    return () => clearTimeout(h);
  }, [style, mode, preset, id, mutate, mutateProject, mutateProps]);

  const live = useMemo(() => (props ? { ...props, style, mode, preset: preset as typeof props.preset } : null), [props, style, mode, preset]);
  const drop = live ? biggestDrop(live) : null;
  const bar = live ? (60 / live.map.bpm) * 4 : 0;
  const previewStart = drop ? Math.max(0, drop.start - 2 * bar) : 0;

  if (proj && proj.project.status !== "analyzed") {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        Analyze the track first. <Link className="text-primary underline" href={`/projects/${id}/analyze`}>Go to Analyze</Link>
      </div>
    );
  }

  const set = <K extends keyof StyleConfig>(k: K, v: StyleConfig[K]) => setStyle((s) => ({ ...s, [k]: v }));

  return (
    <div className="grid gap-5 p-5 xl:grid-cols-[1fr_380px]">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Live preview: 10 seconds around the biggest drop</h2>
          <span className="text-xs text-muted-foreground">{saving ? <><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Saving…</> : "All changes saved"}</span>
        </div>
        {live ? (
          <PreviewPlayer props={live} startTime={previewStart} duration={10} loop className="w-full" />
        ) : (
          <div className="grid aspect-video place-items-center rounded-lg border text-sm text-muted-foreground">Loading preview…</div>
        )}
        {mode !== "visualizer" && (
          <p className="text-xs text-muted-foreground">
            In {mode === "hybrid" ? "hybrid" : "montage"} mode, AI clips replace the shader scenes {mode === "hybrid" ? "on builds and drops" : "everywhere"} once you generate them (Storyboard → Generate). Until then the preview uses shaders.
          </p>
        )}
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Mode</CardTitle></CardHeader>
          <CardContent className="grid gap-2">
            {MODES.map((m) => (
              <button key={m.id} onClick={() => setMode(m.id)} className={cn("cursor-pointer rounded-md border p-3 text-left transition-colors", mode === m.id ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-accent")}>
                <div className="text-sm font-medium">{m.name}</div>
                <div className="text-xs text-muted-foreground">{m.desc}</div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Preset</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <button key={p.id} onClick={() => setPreset(p.id)} className={cn("cursor-pointer rounded-md border p-2 text-left text-xs transition-colors", preset === p.id ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-accent")}>
                <span className="mb-1.5 flex h-2 overflow-hidden rounded-sm">{p.palette.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}</span>
                {p.name}
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Feel</CardTitle>
            <CardDescription className="text-xs">Fine-tune the preset for this track.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Slider label="Intensity" hint="How hard visuals react to the kick and bass" value={style.intensity} min={0} max={1.5} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("intensity", v)} />
            <Slider label="Cut rhythm" hint="Slower ← cuts → faster" value={Math.log2(style.cutRate)} min={-1} max={1} step={1} fmt={(v) => (v === 0 ? "Preset" : v > 0 ? "2× faster" : "2× slower")} onChange={(v) => set("cutRate", Math.pow(2, v))} />
            <Slider label="Palette shift" hint="Rotates the preset's colours" value={style.hueShift} min={-180} max={180} step={5} fmt={(v) => `${v}°`} onChange={(v) => set("hueShift", v)} />
            <Toggle id="title" label="Title card at the start" checked={style.titleCard} onChange={(v) => set("titleCard", v)} />
            <Toggle id="cover" label="Show cover art in intro & breakdown" checked={style.useCover} onChange={(v) => set("useCover", v)} />
            <Toggle id="debug" label="Debug overlay (beat & bar numbers)" checked={style.debug} onChange={(v) => set("debug", v)} />
          </CardContent>
        </Card>

        <Button asChild className="w-full">
          <Link href={`/projects/${id}/${mode === "visualizer" ? "render" : "storyboard"}`}>
            Continue to {mode === "visualizer" ? "Render" : "Storyboard"} <ArrowRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function Slider({ label, hint, value, min, max, step, fmt, onChange }: { label: string; hint: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="font-mono text-xs text-muted-foreground">{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function Toggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="text-xs font-normal">{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
