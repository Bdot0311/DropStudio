"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { FlaskConical, Music2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, fetcher } from "@/lib/utils";
import { presetById } from "@/lib/presets";
import { fmtTime } from "@/lib/grid";
import type { Project } from "@/lib/types";

const STATUS: Record<string, { label: string; variant: "default" | "success" | "warning" | "destructive" | "primary" }> = {
  new: { label: "No audio", variant: "default" },
  uploaded: { label: "Uploaded", variant: "default" },
  analyzing: { label: "Analyzing…", variant: "primary" },
  analyzed: { label: "Analyzed", variant: "success" },
  error: { label: "Error", variant: "destructive" },
};

export default function LibraryPage() {
  const router = useRouter();
  const { data, mutate, isLoading } = useSWR<Project[]>("/api/projects", fetcher, { refreshInterval: 3000 });

  async function createFixture() {
    try {
      const { project } = await api<{ project: Project }>("/api/fixture", { method: "POST" });
      router.push(`/projects/${project.id}/analyze`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove(p: Project) {
    if (!confirm(`Delete "${p.title}" and all its files? This can't be undone.`)) return;
    await api(`/api/projects/${p.id}`, { method: "DELETE" });
    mutate();
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          <p className="text-sm text-muted-foreground">Your tracks and their videos.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={createFixture} title="Creates a synthetic 128 BPM track with a known breakdown and drop">
            <FlaskConical /> Test track
          </Button>
          <Button asChild>
            <Link href="/projects/new">
              <Plus /> New project
            </Link>
          </Button>
        </div>
      </div>

      {!isLoading && data?.length === 0 && (
        <div className="grid place-items-center rounded-lg border border-dashed py-20 text-center">
          <Music2 className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No projects yet</p>
          <p className="mb-5 mt-1 text-sm text-muted-foreground">Drop in a finished track to get started, or try the built-in test track.</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={createFixture}>
              <FlaskConical /> Try the test track
            </Button>
            <Button asChild>
              <Link href="/projects/new">
                <Plus /> New project
              </Link>
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((p) => {
          const preset = presetById(p.preset);
          const st = STATUS[p.status] ?? STATUS.new;
          return (
            <div key={p.id} className="group relative overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/50">
              <Link href={`/projects/${p.id}/${p.audio_file ? "analyze" : "upload"}`} className="block">
                <div className="h-20" style={{ background: `linear-gradient(120deg, ${preset.palette.join(", ")})` }} />
                <div className="p-4">
                  <div className="truncate font-medium">{p.title}</div>
                  <div className="truncate text-sm text-muted-foreground">{p.artist || "—"}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={st.variant}>{st.label}</Badge>
                    <span>{preset.name}</span>
                    {p.bpm ? <span className="font-mono">{p.bpm} BPM</span> : null}
                    {p.musical_key ? <span>{p.musical_key}</span> : null}
                    {p.duration ? <span className="font-mono">{fmtTime(p.duration)}</span> : null}
                  </div>
                </div>
              </Link>
              <button
                onClick={() => remove(p)}
                className="absolute right-2 top-2 rounded-md bg-black/50 p-1.5 text-white/70 opacity-0 transition-opacity hover:text-white group-hover:opacity-100 cursor-pointer"
                title="Delete project"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
