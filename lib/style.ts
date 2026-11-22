import fs from "node:fs";
import { DEFAULT_STYLE, type StyleConfig } from "./presets/configs";
import { projectFile } from "./paths";

export function readStyle(projectId: string): StyleConfig {
  try {
    return { ...DEFAULT_STYLE, ...JSON.parse(fs.readFileSync(projectFile(projectId, "style.json"), "utf8")) };
  } catch {
    return { ...DEFAULT_STYLE };
  }
}

export function writeStyle(projectId: string, style: Partial<StyleConfig>): StyleConfig {
  const next = { ...readStyle(projectId), ...style };
  next.intensity = Math.min(1.5, Math.max(0, Number(next.intensity)));
  next.cutRate = Math.min(4, Math.max(0.25, Number(next.cutRate)));
  next.hueShift = Math.round(Number(next.hueShift) % 360);
  fs.writeFileSync(projectFile(projectId, "style.json"), JSON.stringify(next, null, 2));
  return next;
}
