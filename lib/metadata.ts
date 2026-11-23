// YouTube metadata pack: title, description, tags, credits. Saved per project as metadata.json.
import fs from "node:fs";
import { getProject, readMusicMap } from "./projects";
import { projectFile } from "./paths";
import { presetConfig } from "./presets/configs";
import { getSetting, SETTINGS } from "./settings";

export type Metadata = { title: string; description: string; tags: string[]; privacy: "private" | "unlisted" | "public"; shortsTitle: string };

const GENRE_TAGS: Record<string, string[]> = {
  melodic: ["melodic techno", "melodic house", "afterlife", "progressive house", "deep house"],
  tech_house: ["tech house", "house music", "groovy", "minimal tech house"],
  techno: ["techno", "underground techno", "hard techno", "warehouse techno", "peak time techno"],
  future_rave: ["future rave", "big room", "edm", "rave", "mainstage"],
};

const LINK_KEYS = ["link_spotify", "link_apple_music", "link_soundcloud", "link_beatport", "link_instagram", "link_tiktok", "link_website"] as const;

export function defaultMetadata(projectId: string): Metadata {
  const p = getProject(projectId)!;
  const map = readMusicMap(projectId);
  const preset = presetConfig(p.preset);
  const artist = p.artist || getSetting("default_artist") || "Artist";
  const links = LINK_KEYS.map((k) => [SETTINGS[k].label, getSetting(k)] as const).filter(([, v]) => v);
  const description = [
    `${artist} - ${p.title}`,
    "",
    links.length ? "🎧 Listen & follow:" : "",
    ...links.map(([label, url]) => `${label}: ${url}`),
    links.length ? "" : "",
    map ? `${map.bpm} BPM${map.key ? ` · ${map.key}${map.camelot ? ` (${map.camelot})` : ""}` : ""} · ${preset.name}` : preset.name,
    "",
    "Credits",
    `Music: ${artist}`,
    `Visuals: ${artist} (made with Drop Studio)`,
    "",
    `#${preset.name.split(" ")[0].replace(/[^a-zA-Z]/g, "").toLowerCase()} #${artist.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()} #electronicmusic`,
  ].filter((l, i, arr) => !(l === "" && arr[i - 1] === ""));
  const tags = Array.from(new Set([artist, p.title, `${artist} ${p.title}`, ...GENRE_TAGS[p.preset] ?? [], "electronic music", "dance music", map ? `${Math.round(map.bpm)} bpm` : ""].filter(Boolean)));
  return {
    title: `${artist} - ${p.title} (Official Visualizer)`.slice(0, 100),
    shortsTitle: `${artist} - ${p.title} #shorts`.slice(0, 100),
    description: description.join("\n").slice(0, 5000),
    tags: trimTags(tags),
    privacy: "private",
  };
}

/** YouTube allows ~500 characters of tags in total. */
export function trimTags(tags: string[]): string[] {
  const out: string[] = [];
  let len = 0;
  for (const t of tags.map((x) => x.trim()).filter(Boolean)) {
    if (len + t.length + 1 > 480) break;
    out.push(t);
    len += t.length + 1;
  }
  return out;
}

export function readMetadata(projectId: string): Metadata {
  try {
    return { ...defaultMetadata(projectId), ...JSON.parse(fs.readFileSync(projectFile(projectId, "metadata.json"), "utf8")) };
  } catch {
    return defaultMetadata(projectId);
  }
}

export function writeMetadata(projectId: string, m: Partial<Metadata>): Metadata {
  const next = { ...readMetadata(projectId), ...m };
  next.title = next.title.slice(0, 100);
  next.shortsTitle = next.shortsTitle.slice(0, 100);
  next.description = next.description.slice(0, 5000);
  next.tags = trimTags(next.tags);
  if (!["private", "unlisted", "public"].includes(next.privacy)) next.privacy = "private";
  fs.writeFileSync(projectFile(projectId, "metadata.json"), JSON.stringify(next, null, 2));
  return next;
}

export function metadataText(projectId: string): string {
  const m = readMetadata(projectId);
  return [
    "TITLE", m.title, "",
    "SHORTS TITLE", m.shortsTitle, "",
    "DESCRIPTION", m.description, "",
    "TAGS (comma separated)", m.tags.join(", "), "",
    "UPLOAD NOTES",
    "- Upload main.mp4 as the video and thumbnail.jpg as its custom thumbnail.",
    "- Upload short.mp4 separately: YouTube treats vertical videos under 3 minutes as Shorts.",
    "- If your release has Content ID enabled through your distributor, whitelist your own channel first or your upload will be claimed.",
  ].join("\n");
}
