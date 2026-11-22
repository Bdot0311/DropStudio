"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { FileAudio, ImagePlus, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { PRESETS } from "@/lib/presets";
import { api, cn, fetcher } from "@/lib/utils";
import { uploadFile } from "@/lib/upload";
import type { Asset, Project, RenderMode } from "@/lib/types";

const MODES: { id: RenderMode; name: string; tag: string; desc: string }[] = [
  { id: "visualizer", name: "A · Visualizer", tag: "Free", desc: "Audio-reactive shader scenes. No AI, no cost." },
  { id: "montage", name: "B · AI montage", tag: "Paid", desc: "A small pool of AI clips, cut musically to your track." },
  { id: "hybrid", name: "C · Hybrid", tag: "Default", desc: "AI clips on drops, shaders on intros and breakdowns." },
];

const AUDIO_ACCEPT = ".wav,.aif,.aiff,.mp3,.flac,audio/*";

type Props = { project?: Project; assets?: Asset[]; onSaved?: () => void };

export function ProjectForm({ project, assets = [], onSaved }: Props) {
  const router = useRouter();
  const { data: settings } = useSWR<Record<string, unknown>>("/api/settings", fetcher);
  const [title, setTitle] = useState(project?.title ?? "");
  const [artist, setArtist] = useState(project?.artist ?? "");
  const [preset, setPreset] = useState(project?.preset ?? "melodic");
  const [mode, setMode] = useState<RenderMode>(project?.mode ?? "hybrid");
  const [vibe, setVibe] = useState(project?.vibe ?? "");
  const [audio, setAudio] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const audioInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!project && !artist && typeof settings?.default_artist === "string") setArtist(settings.default_artist);
  }, [settings, project, artist]);

  function pickAudio(f: File | undefined) {
    if (!f) return;
    if (!/\.(wav|aiff?|mp3|flac)$/i.test(f.name)) {
      toast.error("Use a WAV, AIFF, MP3 or FLAC file.");
      return;
    }
    setAudio(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim());
  }

  async function submit() {
    if (!project && !audio) {
      toast.error("Add your track first.");
      return;
    }
    try {
      setBusy("Saving");
      const fields = { title: title || "Untitled track", artist, preset, mode, vibe };
      const p = project
        ? await api<Project>(`/api/projects/${project.id}`, { method: "PATCH", json: fields })
        : await api<Project>("/api/projects", { method: "POST", json: fields });

      if (audio) {
        setBusy(`Uploading ${audio.name}`);
        setProgress(0);
        await uploadFile(`/api/projects/${p.id}/upload?kind=audio&name=${encodeURIComponent(audio.name)}`, audio, setProgress);
      }
      if (cover) {
        setBusy("Uploading cover art");
        await uploadFile(`/api/projects/${p.id}/upload?kind=cover&name=${encodeURIComponent(cover.name)}`, cover);
      }
      for (const ph of photos) {
        setBusy(`Uploading ${ph.name}`);
        await uploadFile(`/api/projects/${p.id}/upload?kind=photo&name=${encodeURIComponent(ph.name)}`, ph);
      }
      if (audio) {
        await api(`/api/projects/${p.id}/analyze`, { method: "POST", json: {} });
        router.push(`/projects/${p.id}/analyze`);
      } else {
        toast.success("Saved");
        setCover(null);
        setPhotos([]);
        onSaved?.();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function removeAsset(a: Asset) {
    await api(`/api/projects/${a.project_id}/assets/${a.id}`, { method: "DELETE" });
    onSaved?.();
  }

  const existingCover = assets.find((a) => a.kind === "cover");
  const existingPhotos = assets.filter((a) => a.kind === "photo");

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-6">
        {/* Audio drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pickAudio(e.dataTransfer.files[0]);
          }}
          onClick={() => audioInput.current?.click()}
          className={cn(
            "grid cursor-pointer place-items-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragging ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:border-primary/50"
          )}
        >
          <input ref={audioInput} type="file" accept={AUDIO_ACCEPT} hidden onChange={(e) => pickAudio(e.target.files?.[0])} />
          {audio ? (
            <div className="flex items-center gap-3">
              <FileAudio className="h-8 w-8 text-primary" />
              <div className="text-left">
                <div className="font-medium">{audio.name}</div>
                <div className="text-sm text-muted-foreground">{(audio.size / 1e6).toFixed(1)} MB · click to change</div>
              </div>
            </div>
          ) : (
            <>
              <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
              <div className="font-medium">{project?.audio_file ? "Replace the track" : "Drop your track here"}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                WAV, AIFF, MP3 or FLAC. Use your final master WAV for best quality.
                {project?.audio_file && <> Current: <span className="font-mono">{project.audio_file}</span></>}
              </div>
            </>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Track title" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="artist">Artist</Label>
            <Input id="artist" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist name" />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Genre preset</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md border p-3 text-left transition-colors",
                  preset === p.id ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-accent"
                )}
              >
                <span className="flex h-9 w-9 shrink-0 overflow-hidden rounded">
                  {p.palette.map((c) => (
                    <span key={c} className="flex-1" style={{ background: c }} />
                  ))}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{p.tagline}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Video mode</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={cn(
                  "cursor-pointer rounded-md border p-3 text-left transition-colors",
                  mode === m.id ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-accent"
                )}
              >
                <div className="flex items-center justify-between text-sm font-medium">
                  {m.name}
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{m.tag}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{m.desc}</div>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">You can change this later. Nothing is ever charged without a confirmation step.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="vibe">Vibe (optional)</Label>
          <Textarea id="vibe" value={vibe} onChange={(e) => setVibe(e.target.value)} placeholder="e.g. night drive along a foggy coast, lonely lighthouse, cold blue light turning to sunrise" />
        </div>
      </div>

      <div className="space-y-6">
        <ImagePicker
          label="Cover art (optional)"
          hint="Becomes a reactive layer in the video and can be used on the thumbnail."
          files={cover ? [cover] : []}
          existing={existingCover && !cover ? [existingCover] : []}
          onAdd={(f) => setCover(f[0] ?? null)}
          onRemoveNew={() => setCover(null)}
          onRemoveExisting={removeAsset}
        />
        <ImagePicker
          label="Photos (optional)"
          hint="Press shots or crowd photos you own. They can be mixed into the video."
          multiple
          files={photos}
          existing={existingPhotos}
          onAdd={(f) => setPhotos((p) => [...p, ...f])}
          onRemoveNew={(i) => setPhotos((p) => p.filter((_, j) => j !== i))}
          onRemoveExisting={removeAsset}
        />

        <div className="rounded-lg border bg-card p-4">
          {busy ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> {busy}…
              </div>
              {busy.startsWith("Uploading") && <Progress value={progress} />}
            </div>
          ) : (
            <Button className="w-full" size="lg" onClick={submit}>
              {project ? (audio ? "Save & re-analyze" : "Save changes") : "Create project & analyze"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ImagePicker(props: {
  label: string;
  hint: string;
  multiple?: boolean;
  files: File[];
  existing: Asset[];
  onAdd: (f: File[]) => void;
  onRemoveNew: (i: number) => void;
  onRemoveExisting: (a: Asset) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const u = props.files.map((f) => URL.createObjectURL(f));
    setUrls(u);
    return () => u.forEach(URL.revokeObjectURL);
  }, [props.files]);

  return (
    <div className="space-y-2">
      <Label>{props.label}</Label>
      <div className="flex flex-wrap gap-2">
        {props.existing.map((a) => (
          <Thumb key={a.id} src={`/api/projects/${a.project_id}/files/${a.filename}`} onRemove={() => props.onRemoveExisting(a)} />
        ))}
        {urls.map((u, i) => (
          <Thumb key={u} src={u} onRemove={() => props.onRemoveNew(i)} pending />
        ))}
        {(props.multiple || props.files.length + props.existing.length === 0) && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="grid h-20 w-20 cursor-pointer place-items-center rounded-md border border-dashed text-muted-foreground hover:border-primary/50 hover:text-foreground"
          >
            <ImagePlus className="h-5 w-5" />
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          multiple={props.multiple}
          hidden
          onChange={(e) => {
            props.onAdd(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{props.hint}</p>
    </div>
  );
}

function Thumb({ src, onRemove, pending }: { src: string; onRemove: () => void; pending?: boolean }) {
  return (
    <div className={cn("relative h-20 w-20 overflow-hidden rounded-md border", pending && "ring-1 ring-primary/50")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-full w-full object-cover" />
      <button type="button" onClick={onRemove} className="absolute right-1 top-1 cursor-pointer rounded bg-black/60 p-0.5 text-white" title="Remove">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
