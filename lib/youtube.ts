// YouTube Data API v3: OAuth (installed-app style, localhost redirect) and token refresh.
import { getSetting, saveSettings } from "./settings";

// Overridable only for automated tests against a local fake server.
export const GOOGLE_TOKEN_URL = process.env.DROP_GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token";
export const YT_API = process.env.DROP_YOUTUBE_API || "https://www.googleapis.com";

export const YT_SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];

export function redirectUri(origin: string) {
  return `${origin}/api/youtube/callback`;
}

export function authUrl(origin: string, state: string): string {
  const id = getSetting("youtube_client_id");
  if (!id) throw new Error("Add your Google OAuth client ID and secret in Settings → YouTube first.");
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", id);
  u.searchParams.set("redirect_uri", redirectUri(origin));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", YT_SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("state", state);
  return u.toString();
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(GOOGLE_TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  const data = (await res.json()) as { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) throw new Error(`Google sign-in failed: ${data.error_description || data.error || res.status}`);
  return data;
}

export async function exchangeCode(code: string, origin: string) {
  const data = await tokenRequest({
    code, client_id: getSetting("youtube_client_id"), client_secret: getSetting("youtube_client_secret"),
    redirect_uri: redirectUri(origin), grant_type: "authorization_code",
  });
  if (!data.refresh_token) throw new Error("Google didn't return a refresh token. Remove Drop Studio's access at myaccount.google.com/permissions and connect again.");
  saveSettings({ youtube_refresh_token: data.refresh_token });
  const ch = await channelInfo(data.access_token!).catch(() => null);
  if (ch) saveSettings({ youtube_channel: ch });
}

export async function accessToken(): Promise<string> {
  const refresh = getSetting("youtube_refresh_token");
  if (!refresh) throw new Error("Connect your YouTube channel in Settings → YouTube first.");
  const data = await tokenRequest({ refresh_token: refresh, client_id: getSetting("youtube_client_id"), client_secret: getSetting("youtube_client_secret"), grant_type: "refresh_token" });
  return data.access_token!;
}

async function channelInfo(token: string): Promise<string | null> {
  const res = await fetch(YT_API + "/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${token}` } });
  const data = (await res.json()) as { items?: { snippet: { title: string } }[] };
  return data.items?.[0]?.snippet.title ?? null;
}
