"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/utils";

type EstimateResp = {
  estimate: { summary: string; total: number; model: string; provider: string; count: number; cached: number };
  spent: number;
  cap: number;
  fits: boolean;
  shotIds: string[];
};

/**
 * Shows the cost estimate before any paid batch; nothing is spent until Confirm.
 * The estimate comes from the server, using the same cache keys and prices as the worker.
 */
export function ConfirmSpend({
  open, onOpenChange, projectId, kind, shotIds, tier, onStarted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  kind: "keyframes" | "clips";
  shotIds?: string[];
  tier?: "draft" | "final";
  onStarted: () => void;
}) {
  const [est, setEst] = useState<EstimateResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const idsKey = shotIds?.join(",");

  useEffect(() => {
    if (!open) return;
    setEst(null);
    setErr(null);
    api<EstimateResp>(`/api/projects/${projectId}/generate`, { method: "POST", json: { kind, shotIds: idsKey ? idsKey.split(",") : undefined, tier } })
      .then(setEst)
      .catch((e) => setErr((e as Error).message));
  }, [open, projectId, kind, idsKey, tier]);

  async function confirm() {
    setBusy(true);
    try {
      await api(`/api/projects/${projectId}/generate`, { method: "POST", json: { kind, shotIds: est?.shotIds, tier, confirm: true } });
      onOpenChange(false);
      onStarted();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const free = est && est.estimate.total === 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{kind === "keyframes" ? "Generate keyframes" : `Animate keyframes (${tier ?? "draft"} quality)`}</DialogTitle>
        <DialogDescription className="mt-1">Review the cost before anything is sent to the provider.</DialogDescription>
        <div className="mt-5 space-y-3">
          {err && (
            <div className="flex gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {err}
            </div>
          )}
          {!est && !err && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Calculating…
            </div>
          )}
          {est && (
            <>
              <div className="rounded-md border bg-card p-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Estimated cost</div>
                <div className="mt-1 font-mono text-3xl font-semibold">${est.estimate.total.toFixed(2)}</div>
                <div className="mt-2 text-sm">{est.estimate.summary}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {est.estimate.model} · {est.estimate.provider}
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                Budget: ${est.spent.toFixed(2)} spent of ${est.cap.toFixed(2)} → <span className="text-foreground">${(est.spent + est.estimate.total).toFixed(2)}</span> after this.
              </div>
              {!est.fits && (
                <div className="flex gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> This would go over the project&apos;s budget cap. Raise it in Settings or select fewer items.
                </div>
              )}
              {est.estimate.provider === "mock" && (
                <p className="text-xs text-warning">
                  You&apos;re on the free test provider: it makes placeholder footage and only pretends to charge. Choose fal.ai or Replicate in Settings for real AI footage.
                </p>
              )}
            </>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={confirm} disabled={!est || !est.fits || busy}>
              {busy && <Loader2 className="animate-spin" />} {free ? "Start (free)" : `Confirm & spend ~$${est?.estimate.total.toFixed(2) ?? "…"}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
