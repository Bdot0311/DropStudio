"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Eye, EyeOff, KeyRound, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, fetcher } from "@/lib/utils";

type Secret = { set: boolean; last4: string };
type S = Record<string, string | Secret>;

const LINKS = [
  ["link_spotify", "Spotify", "https://open.spotify.com/artist/…"],
  ["link_apple_music", "Apple Music", "https://music.apple.com/…"],
  ["link_soundcloud", "SoundCloud", "https://soundcloud.com/…"],
  ["link_beatport", "Beatport", "https://www.beatport.com/artist/…"],
  ["link_instagram", "Instagram", "https://instagram.com/…"],
  ["link_tiktok", "TikTok", "https://tiktok.com/@…"],
  ["link_website", "Website", "https://…"],
] as const;

export default function SettingsPage() {
  const { data, mutate } = useSWR<S>("/api/settings", fetcher);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const f: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) f[k] = typeof v === "string" ? v : "";
    setForm(f);
  }, [data]);

  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      const next = await api<S>("/api/settings", { method: "PUT", json: form });
      mutate(next, { revalidate: false });
      toast.success("Settings saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function clearSecret(k: string) {
    const next = await api<S>("/api/settings", { method: "PUT", json: { [k]: "__clear__" } });
    mutate(next, { revalidate: false });
    toast.success("Key removed");
  }

  if (!data) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Saved locally in data/drop.db. Keys never leave this computer except to call the provider you chose.</p>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Save
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI providers</CardTitle>
          <CardDescription>Only needed for AI montage and hybrid modes. The free visualizer works without any keys.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Default provider</Label>
            <Select value={form.default_provider || "none"} onValueChange={set("default_provider")}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (visualizer only)</SelectItem>
                <SelectItem value="fal">fal.ai</SelectItem>
                <SelectItem value="replicate">Replicate</SelectItem>
                <SelectItem value="comfyui">Local ComfyUI</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <SecretField k="fal_key" label="fal.ai API key" help="fal.ai → Dashboard → Keys" value={data.fal_key as Secret} draft={form.fal_key ?? ""} onChange={set("fal_key")} onClear={() => clearSecret("fal_key")} />
          <SecretField k="replicate_token" label="Replicate API token" help="replicate.com → Account → API tokens" value={data.replicate_token as Secret} draft={form.replicate_token ?? ""} onChange={set("replicate_token")} onClear={() => clearSecret("replicate_token")} />
          <div className="space-y-2">
            <Label htmlFor="comfy">ComfyUI URL</Label>
            <Input id="comfy" value={form.comfyui_url ?? ""} onChange={(e) => set("comfyui_url")(e.target.value)} className="max-w-sm" />
          </div>
          <p className="text-xs text-muted-foreground">Model choices and prices come with the AI pipeline in Phase 3 (editable in <code>config/models.json</code>).</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Budget</CardTitle>
          <CardDescription>Jobs that would push a project past this cap are blocked. Every paid batch also shows its cost first.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">$</span>
            <Input type="number" min={0} step={1} value={form.budget_cap_usd ?? ""} onChange={(e) => set("budget_cap_usd")(e.target.value)} className="w-32" />
            <span className="text-sm text-muted-foreground">per project</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Artist & links</CardTitle>
          <CardDescription>Used to pre-fill new projects and the YouTube description template.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="artist">Artist name</Label>
            <Input id="artist" value={form.default_artist ?? ""} onChange={(e) => set("default_artist")(e.target.value)} className="max-w-sm" />
          </div>
          {LINKS.map(([k, label, ph]) => (
            <div key={k} className="space-y-2">
              <Label htmlFor={k}>{label}</Label>
              <Input id={k} value={form[k] ?? ""} placeholder={ph} onChange={(e) => set(k)(e.target.value)} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rendering</CardTitle>
          <CardDescription>Used from Phase 2. Leave blank for automatic.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="conc">Render concurrency</Label>
            <Input id="conc" placeholder="auto (half your CPU cores)" value={form.render_concurrency ?? ""} onChange={(e) => set("render_concurrency")(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Headless Chrome GL backend</Label>
            <Select value={form.gl_backend || "angle"} onValueChange={set("gl_backend")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="angle">angle (recommended on Mac)</SelectItem>
                <SelectItem value="egl">egl</SelectItem>
                <SelectItem value="swiftshader">swiftshader (CPU, slow, always works)</SelectItem>
                <SelectItem value="swangle">swangle</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SecretField(props: { k: string; label: string; help: string; value: Secret; draft: string; onChange: (v: string) => void; onClear: () => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={props.k} className="flex items-center gap-2">
        <KeyRound className="h-3.5 w-3.5" /> {props.label}
        {props.value?.set && <span className="text-xs font-normal text-success">saved{props.value.last4 && ` · …${props.value.last4}`}</span>}
      </Label>
      <div className="flex max-w-md gap-2">
        <Input
          id={props.k}
          type={show ? "text" : "password"}
          autoComplete="off"
          placeholder={props.value?.set ? "Leave blank to keep the saved key" : "Paste your key"}
          value={props.draft}
          onChange={(e) => props.onChange(e.target.value)}
        />
        <Button type="button" variant="ghost" size="icon" onClick={() => setShow((s) => !s)} title={show ? "Hide" : "Show"}>
          {show ? <EyeOff /> : <Eye />}
        </Button>
        {props.value?.set && (
          <Button type="button" variant="ghost" size="sm" onClick={props.onClear}>
            Remove
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{props.help}</p>
    </div>
  );
}
