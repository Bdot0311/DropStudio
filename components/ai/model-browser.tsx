"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Check, Loader2, RefreshCw, Search, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api, cn, fetcher } from "@/lib/utils";

export type BrowserRole = "image" | "character" | "video" | "morph";
type Model = { id: string; name: string; description: string; thumb: string | null; animated: string | null; date: string | null; featured: boolean; recommended: boolean; price: string | null; tier: string | null };
type Payload = { role: BrowserRole; models: Model[]; selected: Record<string, string | null>; fetchedAt: string | null; warning: string | null; priced: boolean };

const TITLE: Record<BrowserRole, string> = {
  image: "Keyframe image model",
  character: "Model for shots of you (uses your photos)",
  video: "Video model",
  morph: "Morph transition model (start + end frame)",
};

/** Lab / maker from an endpoint id: "fal-ai/kling-video/v3/…" → "kling-video", "google/veo…" → "google". */
const maker = (id: string) => {
  const [a, b] = id.split("/");
  return a === "fal-ai" ? b?.split("-")[0] ?? a : a;
};

/**
 * Higgsfield-style model picker over fal's whole catalog. Featured = Drop Studio's tested picks;
 * All = every model fal offers for this job (Drop Studio reads each one's inputs when you pick it).
 */
export function ModelBrowser({ role, slot, open, onOpenChange, onPicked }: {
  role: BrowserRole; slot?: "draft" | "final"; open: boolean; onOpenChange: (o: boolean) => void; onPicked?: (id: string) => void;
}) {
  const [refresh, setRefresh] = useState(0);
  const { data, isLoading, mutate } = useSWR<Payload>(open ? `/api/fal/catalog?role=${role}${refresh ? `&refresh=1&n=${refresh}` : ""}` : null, fetcher);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"featured" | "all" | "new">("featured");
  const [busy, setBusy] = useState<string | null>(null);
  const current = data ? (role === "video" ? data.selected[slot ?? "final"] : data.selected[role]) : null;

  const list = useMemo(() => {
    let m = data?.models ?? [];
    const s = q.trim().toLowerCase();
    if (s) m = m.filter((x) => `${x.name} ${x.id} ${x.description}`.toLowerCase().includes(s));
    // Featured = Drop Studio's picks plus whatever you're using now
    else if (tab === "featured") m = [...m.filter((x) => x.id === current && !x.featured), ...m.filter((x) => x.featured)];
    if (tab === "new") m = [...m].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return m;
  }, [data, q, tab, current]);

  async function pick(m: Model) {
    setBusy(m.id);
    try {
      const r = await api<{ label: string }>("/api/fal/catalog", { method: "POST", json: { role, slot, id: m.id } });
      toast.success(`Now using ${r.label}`);
      await mutate();
      onPicked?.(m.id);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const total = data?.models.length ?? 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] max-w-6xl flex-col p-0">
        <div className="space-y-3 border-b p-5 pb-4">
          <div>
            <DialogTitle>{TITLE[role]}{role === "video" ? ` · ${slot === "draft" ? "Draft" : "Final"} tier` : ""}</DialogTitle>
            <DialogDescription className="mt-1 text-xs">
              Every model fal.ai offers for this job{total ? ` (${total})` : ""}. Featured ones are tested with Drop Studio; for any other, Drop Studio reads its inputs when you pick it.
              {data && !data.priced && " Add your fal key in Settings to see every model's price."}
            </DialogDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-52 flex-1">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: kling, veo, seedance, hailuo, flux…" className="h-8 w-full rounded-md border border-input bg-transparent pl-8 pr-2 text-sm" />
            </div>
            {(["featured", "all", "new"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={cn("cursor-pointer rounded-md border px-2.5 py-1 text-xs", tab === t && !q ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:bg-accent")}>
                {t === "featured" ? "Featured" : t === "all" ? `All${total ? ` ${total}` : ""}` : "Newest"}
              </button>
            ))}
            <Button size="sm" variant="ghost" title="Download fal's latest model list" onClick={() => setRefresh((n) => n + 1)}><RefreshCw /></Button>
          </div>
          {data?.warning && <p className="text-xs text-warning">{data.warning}</p>}
        </div>
        <div className="flex-1 overflow-y-auto p-5 pt-4">
          {isLoading || !data ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading fal&apos;s models…</div>
          ) : !list.length ? (
            <p className="text-sm text-muted-foreground">No models match “{q}”.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {list.map((m) => (
                <button key={m.id} onClick={() => pick(m)} disabled={!!busy}
                  className={cn("group flex h-full cursor-pointer flex-col justify-start overflow-hidden rounded-lg border bg-card text-left transition hover:border-primary", current === m.id && "border-primary ring-2 ring-primary")}>
                  <div className="relative aspect-video w-full shrink-0 bg-muted">
                    {m.thumb && <img src={m.thumb} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
                    {m.animated && <img src={m.animated} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-0 transition group-hover:opacity-100" />}
                    <div className="absolute left-1.5 top-1.5 flex gap-1">
                      {m.recommended && <span className="flex items-center gap-0.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground"><Star className="h-2.5 w-2.5" /> Recommended</span>}
                      {m.featured && !m.recommended && <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">Featured</span>}
                    </div>
                    {current === m.id && <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground"><Check className="h-2.5 w-2.5" /> In use</span>}
                    {busy === m.id && <div className="absolute inset-0 flex items-center justify-center bg-black/50"><Loader2 className="h-5 w-5 animate-spin text-white" /></div>}
                  </div>
                  <div className="space-y-1 p-2.5">
                    <div className="line-clamp-1 text-sm font-medium">{m.name}</div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="capitalize">{maker(m.id)}</span>
                      {m.price && <span className="ml-auto font-mono text-foreground">{m.price}</span>}
                    </div>
                    {m.description && <p className="line-clamp-2 text-[11px] text-muted-foreground">{m.description}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** "Keyframe model: Seedream 4.5 · Change" line that opens the browser. */
export function ModelLine({ label, role, slot, current, onPicked, disabled }: {
  label: string; role: BrowserRole; slot?: "draft" | "final"; current: string; onPicked?: (id: string) => void; disabled?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <span className="truncate font-medium">{current}</span>
      {disabled ? (
        <span className="ml-auto text-[11px] text-muted-foreground">{disabled}</span>
      ) : (
        <Button size="sm" variant="ghost" className="ml-auto h-6 px-2 text-xs" onClick={() => setOpen(true)}>Change</Button>
      )}
      {!disabled && <ModelBrowser role={role} slot={slot} open={open} onOpenChange={setOpen} onPicked={onPicked} />}
    </div>
  );
}
