import { publicSettings, saveSettings } from "@/lib/settings";
import { json, readJson } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  return json(publicSettings());
}

export async function PUT(req: Request) {
  saveSettings(await readJson(req));
  return json(publicSettings());
}
