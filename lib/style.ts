import fs from "node:fs";
import { DEFAULT_STYLE, type StyleConfig } from "./presets/configs";
import { projectFile } from "./paths";

export function readStyle(projectId: string): StyleConfig {
  try {
    const saved = JSON.parse(fs.readFileSync(projectFile(projectId, "style.json"), "utf8"));
    return { ...DEFAULT_STYLE, ...saved, captions: { ...DEFAULT_STYLE.captions, ...(saved.captions ?? {}) }, looks: { ...DEFAULT_STYLE.looks, ...(saved.looks ?? {}) } };
  } catch {
    return { ...DEFAULT_STYLE };
  }
}

export function writeStyle(projectId: string, style: Partial<StyleConfig>): StyleConfig {
  const prev = readStyle(projectId);
  // Nested groups merge field by field, so a partial update never wipes the rest.
  const next = { ...prev, ...style, captions: { ...prev.captions, ...(style.captions ?? {}) }, looks: { ...prev.looks, ...(style.looks ?? {}) } };
  next.intensity = Math.min(1.5, Math.max(0, Number(next.intensity)));
  next.cutRate = Math.min(4, Math.max(0.25, Number(next.cutRate)));
  next.hueShift = Math.round(Number(next.hueShift) % 360);
  next.editStyle = (["capcut", "performance", "teaser"] as const).includes(next.editStyle as never) ? next.editStyle : "clean";
  next.frame = next.frame === "band" ? "band" : "full";
  next.lyricBeats = [1, 2, 4].includes(Number(next.lyricBeats)) ? Number(next.lyricBeats) : 2;
  next.letterbox = !!next.letterbox;
  if (!["preset", "whip", "zoom", "chroma", "push", "pixelate", "freeze", "white", "zoomblur", "mix"].includes(next.transitionMode)) next.transitionMode = "preset";
  if (!["off", "push", "pull", "alternate", "dolly"].includes(next.cameraMove)) next.cameraMove = "off";
  if (!["off", "bars", "mirror"].includes(next.waveform)) next.waveform = "off";
  const lk = { ...DEFAULT_STYLE.looks, ...(next.looks ?? {}) };
  next.looks = { flare: !!lk.flare, leaks: !!lk.leaks, vhs: !!lk.vhs, halftone: !!lk.halftone };
  next.dropAnimation = next.dropAnimation === "shutter" ? "shutter" : "explode";
  next.lightSweep = !!next.lightSweep;
  const shakes = ["off", "handheld-normal-mild", "handheld-normal-strong", "handheld-normal-extreme", "handheld-wideangle-mild", "handheld-wideangle-strong", "handheld-tele-mild", "handheld-tele-strong", "rig-6d-shake", "rig-6d-wobble"];
  if (!shakes.includes(next.cameraShake)) next.cameraShake = "off";
  if (!["off", "drops", "bars"].includes(next.beatAccent)) next.beatAccent = "off";
  if (!["slam", "glitch", "karaoke", "neon", "gradient", "decode", "highlight", "clipwipe", "blurin"].includes(next.captionStyle)) next.captionStyle = "slam";
  const c = { ...DEFAULT_STYLE.captions, ...(next.captions ?? {}) };
  next.captions = {
    hook: String(c.hook).slice(0, 80), drop: String(c.drop).slice(0, 40), cta: String(c.cta).slice(0, 40),
    top: String(c.top ?? "").slice(0, 120), lyrics: String(c.lyrics ?? "").slice(0, 2000),
    date: String(c.date ?? "").slice(0, 40), handle: String(c.handle ?? "").slice(0, 40),
  };
  fs.writeFileSync(projectFile(projectId, "style.json"), JSON.stringify(next, null, 2));
  return next;
}
