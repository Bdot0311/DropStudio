import { NextResponse } from "next/server";
import { exchangeCode } from "@/lib/youtube";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const back = (q: string) => NextResponse.redirect(`${origin}/settings?${q}#youtube`);
  const expected = (db().prepare("SELECT value FROM settings WHERE key='_youtube_oauth_state'").get() as { value: string } | undefined)?.value;
  if (url.searchParams.get("error")) return back(`youtube_error=${encodeURIComponent(url.searchParams.get("error")!)}`);
  if (!expected || url.searchParams.get("state") !== expected) return back("youtube_error=" + encodeURIComponent("Sign-in expired. Please try again."));
  db().prepare("DELETE FROM settings WHERE key='_youtube_oauth_state'").run();
  try {
    await exchangeCode(url.searchParams.get("code") ?? "", origin);
    return back("youtube=connected");
  } catch (e) {
    return back(`youtube_error=${encodeURIComponent((e as Error).message)}`);
  }
}
