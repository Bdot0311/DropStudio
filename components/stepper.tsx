"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check } from "lucide-react";
import { STEPS } from "@/lib/steps";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";

function isDone(slug: string, p: Project): boolean {
  if (slug === "upload") return !!p.audio_file;
  if (slug === "analyze") return p.status === "analyzed";
  if (slug === "style") return p.status === "analyzed";
  return false;
}

export function Stepper({ project }: { project: Project }) {
  const path = usePathname();
  const current = STEPS.find((s) => path.endsWith("/" + s.slug))?.slug;
  return (
    <ol className="flex items-center gap-1 overflow-x-auto">
      {STEPS.map((s, i) => {
        const active = s.slug === current;
        const done = isDone(s.slug, project);
        const skip = s.slug === "storyboard" || s.slug === "generate" ? project.mode === "visualizer" : false;
        return (
          <li key={s.slug} className="flex items-center">
            {i > 0 && <span className="mx-1 h-px w-4 bg-border md:w-6" />}
            <Link
              href={`/projects/${project.id}/${s.slug}`}
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                skip && !active && "opacity-40"
              )}
            >
              <span
                className={cn(
                  "grid h-5 w-5 place-items-center rounded-full border text-[10px]",
                  active ? "border-primary-foreground/40" : done ? "border-success bg-success/15 text-success" : "border-border"
                )}
              >
                {done && !active ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className="whitespace-nowrap">{s.label}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
