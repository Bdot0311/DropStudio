"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/utils";
import type { VideoProps } from "@/remotion/types";

export function useVideoProps(id: string) {
  return useSWR<VideoProps>(`/api/projects/${id}/video-props`, fetcher, { revalidateOnFocus: false });
}

/** The biggest drop: highest-energy section labelled "drop" (falls back to the loudest section). */
export function biggestDrop(p: VideoProps) {
  const drops = p.map.sections.filter((s) => s.type === "drop");
  const pool = drops.length ? drops : p.map.sections;
  return [...pool].sort((a, b) => b.energy - a.energy)[0];
}
