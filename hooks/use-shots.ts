"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/utils";
import type { Job } from "@/lib/types";
import type { Shot } from "@/lib/shots";

export type ShotsPayload = {
  mode: "visualizer" | "montage" | "hybrid";
  shots: Shot[];
  needKeyframes: number;
  keyframeCost: number;
  otherProviderKeyframes: number;
  spent: number;
  cap: number;
  provider: { id: string; label: string };
  keys: { fal: boolean; replicate: boolean };
  hasCharacter: boolean;
  prices: {
    image: { model: string; unit: number };
    draft: { model: string; unit: number; seconds: number };
    final: { model: string; unit: number; seconds: number };
  };
  jobs: { keyframes: Job | null; clips: Job | null };
};

const jobActive = (j: Job | null) => !!j && (j.status === "queued" || j.status === "running");
const busy = (d?: ShotsPayload) => !!d && (d.shots.some((s) => /_(queued|running)$/.test(s.status)) || jobActive(d.jobs.keyframes) || jobActive(d.jobs.clips));

export function useShots(id: string) {
  return useSWR<ShotsPayload>(`/api/projects/${id}/shots`, fetcher, { refreshInterval: (d) => (busy(d) ? 1500 : 0) });
}
export { busy as shotsBusy, jobActive };
