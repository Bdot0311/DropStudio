"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ExternalLink, MonitorPlay as Youtube } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/utils";

type Secret = { set: boolean; last4: string };

export function YoutubeSettings({ data, onSaved }: { data: Record<string, string | Secret>; onSaved: () => void }) {
  const [clientId, setClientId] = useState(String(data.youtube_client_id ?? ""));
  const [secret, setSecret] = useState("");
  const [open, setOpen] = useState(false);
  const connected = (data.youtube_refresh_token as Secret)?.set;
  const secretSet = (data.youtube_client_secret as Secret)?.set;
  const [origin, setOrigin] = useState("http://localhost:3000");

  useEffect(() => {
    setOrigin(window.location.origin);
    const q = new URLSearchParams(window.location.search);
    if (q.get("youtube") === "connected") toast.success("YouTube channel connected");
    if (q.get("youtube_error")) toast.error(q.get("youtube_error")!);
  }, []);

  async function saveAndConnect() {
    await api("/api/settings", { method: "PUT", json: { youtube_client_id: clientId, youtube_client_secret: secret } });
    onSaved();
    window.location.href = "/api/youtube/auth";
  }

  return (
    <Card id="youtube">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Youtube className="h-5 w-5" /> YouTube (optional)</CardTitle>
        <CardDescription>Direct upload from the Publish step. Without this you can always use the Export package and upload in YouTube Studio.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {connected ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <CheckCircle2 className="h-4 w-4 text-success" /> Connected{data.youtube_channel ? <> as <b>{String(data.youtube_channel)}</b></> : ""}
            <Button size="sm" variant="ghost" onClick={async () => { await api("/api/youtube/disconnect", { method: "POST" }); onSaved(); }}>Disconnect</Button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label className="text-xs">OAuth client ID</Label><Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="…apps.googleusercontent.com" /></div>
              <div className="space-y-1.5"><Label className="text-xs">OAuth client secret {secretSet && <span className="text-success">saved</span>}</Label><Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={secretSet ? "Leave blank to keep" : "GOCSPX-…"} /></div>
            </div>
            <Button onClick={saveAndConnect} disabled={!clientId || (!secret && !secretSet)}><Youtube /> Save & connect channel</Button>
          </>
        )}

        <div className="space-y-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
          <p className="flex gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /><span>Until Google audits your Cloud project, every video uploaded through it is locked to <b>private</b>. That&apos;s fine for reviewing: publish by hand in YouTube Studio.</span></p>
          <p className="flex gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /><span>The default API quota is 10,000 units/day and one upload costs about 1,600, so roughly 6 uploads a day.</span></p>
          <p className="flex gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /><span>Content ID: if your distributor registers your releases with Content ID, ask them to whitelist your channel, or your own uploads get claimed.</span></p>
        </div>

        <button className="flex cursor-pointer items-center gap-1 text-sm text-primary" onClick={() => setOpen((o) => !o)}>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} /> How to set up Google Cloud (about 10 minutes, one time)
        </button>
        {open && (
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Open <a className="text-primary underline" href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">Google Cloud Console <ExternalLink className="inline h-3 w-3" /></a> with the Google account that owns your YouTube channel, and create a project (e.g. &quot;Drop Studio&quot;).</li>
            <li>Go to <b>APIs &amp; Services → Library</b>, search <b>YouTube Data API v3</b>, and click <b>Enable</b>.</li>
            <li>Go to <b>APIs &amp; Services → OAuth consent screen</b> (Google Auth Platform). Choose <b>External</b>, fill in the app name and your email, and under <b>Audience → Test users</b> add your own Google account.</li>
            <li>Go to <b>Credentials → Create credentials → OAuth client ID</b>. Application type: <b>Web application</b>. Under <b>Authorized redirect URIs</b> add exactly:<br /><code className="mt-1 inline-block rounded bg-secondary px-2 py-1 text-foreground">{origin}/api/youtube/callback</code></li>
            <li>Copy the <b>Client ID</b> and <b>Client secret</b> into the fields above and click <b>Save &amp; connect channel</b>. Google will warn the app is unverified: that&apos;s your own app, so click <b>Continue</b>.</li>
            <li>Optional: to upload public videos directly, submit the project for Google&apos;s <a className="text-primary underline" href="https://support.google.com/youtube/contact/yt_api_form" target="_blank" rel="noreferrer">API audit</a>. Most people just publish from YouTube Studio instead.</li>
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
