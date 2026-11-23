import { db } from "./db";

/**
 * Settings schema. `secret: true` values (API keys) are never sent back to the browser in full
 * and never logged; the UI only learns whether they're set and their last 4 characters.
 */
export const SETTINGS = {
  fal_key: { secret: true, default: "", label: "fal.ai API key" },
  replicate_token: { secret: true, default: "", label: "Replicate API token" },
  comfyui_url: { secret: false, default: "http://localhost:8188", label: "ComfyUI URL" },
  default_provider: { secret: false, default: "mock", label: "AI provider" },
  fal_image_model: { secret: false, default: "", label: "fal image model" },
  fal_video_draft: { secret: false, default: "", label: "fal draft video model" },
  fal_video_final: { secret: false, default: "", label: "fal final video model" },
  replicate_image_model: { secret: false, default: "", label: "Replicate image model" },
  replicate_video_draft: { secret: false, default: "", label: "Replicate draft video model" },
  replicate_video_final: { secret: false, default: "", label: "Replicate final video model" },
  comfyui_image_model: { secret: false, default: "", label: "" },
  comfyui_video_draft: { secret: false, default: "", label: "" },
  comfyui_video_final: { secret: false, default: "", label: "" },
  mock_image_model: { secret: false, default: "", label: "" },
  mock_video_draft: { secret: false, default: "", label: "" },
  mock_video_final: { secret: false, default: "", label: "" },
  budget_cap_usd: { secret: false, default: "10", label: "Per-project budget cap (USD)" },
  render_concurrency: { secret: false, default: "", label: "Render concurrency" },
  gl_backend: { secret: false, default: "", label: "Headless Chrome GL backend" },
  default_artist: { secret: false, default: "", label: "Artist name" },
  link_spotify: { secret: false, default: "", label: "Spotify" },
  link_apple_music: { secret: false, default: "", label: "Apple Music" },
  link_soundcloud: { secret: false, default: "", label: "SoundCloud" },
  link_beatport: { secret: false, default: "", label: "Beatport" },
  link_instagram: { secret: false, default: "", label: "Instagram" },
  link_tiktok: { secret: false, default: "", label: "TikTok" },
  link_website: { secret: false, default: "", label: "Website" },
  youtube_client_id: { secret: false, default: "", label: "Google OAuth client ID" },
  youtube_client_secret: { secret: true, default: "", label: "Google OAuth client secret" },
  youtube_refresh_token: { secret: true, default: "", label: "YouTube connection" },
  youtube_channel: { secret: false, default: "", label: "Connected channel" },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type PublicSettings = Record<SettingKey, string | { set: boolean; last4: string }>;

function raw(): Record<string, string> {
  const rows = db().prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Server-side only: full values including secrets. */
export function getSetting(key: SettingKey): string {
  const v = raw()[key];
  return v ?? SETTINGS[key].default;
}

export function publicSettings(): PublicSettings {
  const r = raw();
  const out = {} as PublicSettings;
  for (const [key, def] of Object.entries(SETTINGS) as [SettingKey, (typeof SETTINGS)[SettingKey]][]) {
    const v = r[key] ?? def.default;
    out[key] = def.secret ? { set: v.length > 0, last4: v.length >= 8 ? v.slice(-4) : "" } : v;
  }
  return out;
}

export function saveSettings(input: Record<string, unknown>): void {
  const stmt = db().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  const del = db().prepare("DELETE FROM settings WHERE key=?");
  for (const [key, value] of Object.entries(input)) {
    if (!(key in SETTINGS)) continue;
    if (typeof value !== "string") continue;
    const def = SETTINGS[key as SettingKey];
    // For secrets, an empty string from the UI means "unchanged"; the explicit "__clear__" removes it.
    if (def.secret && value === "") continue;
    if (def.secret && value === "__clear__") {
      del.run(key);
      continue;
    }
    stmt.run(key, value.trim());
  }
}
