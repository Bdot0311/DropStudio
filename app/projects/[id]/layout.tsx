"use client";
import { use } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Stepper } from "@/components/stepper";
import { Badge } from "@/components/ui/badge";
import { useProject } from "@/hooks/use-project";
import { presetById } from "@/lib/presets";

export default function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error } = useProject(id);

  if (error) {
    return (
      <div className="p-10 text-center">
        <p className="font-medium">Project not found</p>
        <Link href="/library" className="text-sm text-primary hover:underline">
          Back to Library
        </Link>
      </div>
    );
  }
  if (!data) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  const { project } = data;
  const preset = presetById(project.preset);

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b px-5 py-3">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Link href="/library" className="text-muted-foreground hover:text-foreground" title="Library">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold leading-tight">{project.title}</h1>
            <p className="truncate text-xs text-muted-foreground">{project.artist || "No artist set"}</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              <span className="mr-1 inline-flex h-2.5 w-6 overflow-hidden rounded-sm">
                {preset.palette.map((c) => (
                  <span key={c} className="flex-1" style={{ background: c }} />
                ))}
              </span>
              {preset.name}
            </Badge>
            {project.bpm ? <Badge variant="outline" className="font-mono">{project.bpm} BPM</Badge> : null}
            {project.musical_key ? <Badge variant="outline">{project.musical_key}</Badge> : null}
          </div>
        </div>
        <Stepper project={project} />
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
