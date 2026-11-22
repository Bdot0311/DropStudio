"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/utils";
import type { Job } from "@/lib/types";

const active = (j?: Job) => !!j && (j.status === "queued" || j.status === "running");

export function useRenders(id: string) {
  return useSWR<Record<string, Job>>(`/api/projects/${id}/render`, fetcher, {
    refreshInterval: (d) => (d && Object.values(d).some(active) ? 1000 : 0),
  });
}
export { active as isJobActive };
