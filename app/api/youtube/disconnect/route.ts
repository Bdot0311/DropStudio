import { saveSettings } from "@/lib/settings";
import { json } from "@/lib/http";

export const runtime = "nodejs";

export async function POST() {
  saveSettings({ youtube_refresh_token: "__clear__", youtube_channel: "" });
  return json({ ok: true });
}
