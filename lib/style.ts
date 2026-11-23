import fs from "node:fs";
import { DEFAULT_STYLE, type StyleConfig } from "./presets/configs";
import { projectFile } from "./paths";

export function readStyle(projectId: string): StyleConfig {
  try {
    const saved = JSON.parse(fs.readFileSync(projectFile(projectId, "style.json"), "utf8"));
    return { ...DEFAULT_STYLE, ...saved, captions: { ...DEFAULT_STYLE.captions, ...(saved.captions ?? {}) } };
  } catch {
    return { ...DEFAULT_STYLE };
  }
}

export function writeStyle(projectId: string, style: Partial<StyleConfig>): StyleConfig {
  const next = { ...readStyle(projectId), ...style };
  next.intensity = Math.min(1.5, Math.max(0, Number(next.intensity)));
  next.cutRate = Math.min(4, Math.max(0.25, Number(next.cutRate)));
  next.hueShift = Math.round(Number(next.hueShift) % 360);
  next.editStyle = next.editStyle === "capcut" ? "capcut" : "clean";
  next.letterbox = !!next.letterbox;
  const c = { ...DEFAULT_STYLE.captions, ...(next.captions ?? {}) };
  next.captions = { hook: String(c.hook).slice(0, 80), drop: String(c.drop).slice(0, 40), cta: String(c.cta).slice(0, 40) };
  fs.writeFileSync(projectFile(projectId, "style.json"), JSON.stringify(next, null, 2));
  return next;
}
