import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { authUrl } from "@/lib/youtube";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** Starts Google sign-in. Uses http://localhost:3000/api/youtube/callback as the redirect. */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const state = crypto.randomBytes(16).toString("hex");
  db().prepare("INSERT INTO settings (key, value) VALUES ('_youtube_oauth_state', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(state);
  try {
    return NextResponse.redirect(authUrl(origin, state));
  } catch (e) {
    return NextResponse.redirect(`${origin}/settings?youtube_error=${encodeURIComponent((e as Error).message)}`);
  }
}
