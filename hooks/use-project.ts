"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/utils";
import type { Asset, Job, Project } from "@/lib/types";

export type ProjectPayload = { project: Project; assets: Asset[]; hasMusicMap: boolean; analyzeJob: Job | null };

const isActive = (j: Job | null | undefined) => !!j && (j.status === "queued" || j.status === "running");

export function useProject(id: string) {
  return useSWR<ProjectPayload>(`/api/projects/${id}`, fetcher, {
    refreshInterval: (d) => (d && (isActive(d.analyzeJob) || d.project.status === "analyzing") ? 800 : 0),
  });
}

export { isActive };
