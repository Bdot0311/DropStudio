// Builds the props for the Remotion compositions from a project (server side).
import { readMusicMap, listAssets, getProject } from "./projects";
import { readStyle } from "./style";
import type { MusicMap, Project } from "./types";
import type { ClipRef, LiteMap, VideoProps } from "../remotion/types";
import { listClipRefs, listShots } from "./shots";
import { enhancementIndex } from "./enhance";

export function liteMap(m: MusicMap): LiteMap {
  const e = m.envelopes;
  return {
    duration: m.duration,
    bpm: m.bpm,
    beats: m.beats,
    downbeats: m.downbeats,
    sections: m.sections,
    env: { fps: e.fps, rms: e.rms, low: e.low, mid: e.mid, high: e.high, kick: e.kick, bass: e.bass, other: e.other },
    kicks: m.onsets.kick,
    hats: m.onsets.hats,
    claps: m.onsets.snare_clap ?? [],
  };
}

export type PropsOptions = {
  /** Turns a path inside the project folder (or "cache/..." for the shared clip cache) into a URL. */
  assetUrl: (rel: string) => string;
  width?: number;
  height?: number;
  fps?: number;
  startTime?: number;
  duration?: number;
  titleMode?: VideoProps["titleMode"];
  withAudio?: boolean;
  debug?: boolean;
};

export function buildVideoProps(projectId: string, o: PropsOptions): { props: VideoProps; project: Project; map: MusicMap } {
  const project = getProject(projectId);
  if (!project) throw new Error("Project not found");
  const map = readMusicMap(projectId);
  if (!map) throw new Error("Analyze the track first");
  const style = readStyle(projectId);
  const cover = listAssets(projectId).find((a) => a.kind === "cover");
  const clips: ClipRef[] = project.mode === "visualizer" ? [] : listClipRefs(projectId).map(({ matte, ...c }) => ({ ...c, src: o.assetUrl(c.src), ...(matte && style.textBehind ? { matteSrc: o.assetUrl(matte) } : {}) }));
  // AI morphs whose inputs still match the current clips (the timeline decides where they play).
  const ix = enhancementIndex(projectId);
  const shots = new Map(listShots(projectId).map((s) => [s.id, s]));
  const bridges = clips.length && style.morph && style.morph !== "off"
    ? ix.all.filter((e) => e.kind === "bridge").flatMap((e) => {
        const a = shots.get(e.shot_id), b = shots.get(e.to_shot_id);
        return a && b && ix.bridgeOf(a, b) ? [{ from: e.shot_id, to: e.to_shot_id, src: o.assetUrl(e.file), duration: e.duration ?? 5 }] : [];
      })
    : [];
  const startTime = o.startTime ?? 0;
  const props: VideoProps = {
    map: liteMap(map),
    preset: project.preset as VideoProps["preset"],
    style: { ...style, debug: o.debug ?? style.debug },
    mode: project.mode,
    title: project.title,
    artist: project.artist,
    audioSrc: o.withAudio && project.playback_file ? o.assetUrl(project.playback_file) : null,
    coverSrc: cover ? o.assetUrl(cover.filename) : null,
    clips,
    bridges,
    fps: o.fps ?? 30,
    width: o.width ?? 1920,
    height: o.height ?? 1080,
    startTime,
    duration: o.duration ?? Math.max(0.1, map.duration - startTime),
    titleMode: o.titleMode ?? "intro",
  };
  return { props, project, map };
}
