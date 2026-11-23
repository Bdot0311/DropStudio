"use client";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/utils";

/** Warns when generation would use the free test provider instead of a real API. */
export function ProviderBanner({ provider, keys, onChange }: { provider: string; keys: { fal: boolean; replicate: boolean }; onChange: () => void }) {
  if (provider !== "mock") return null;
  const target = keys.fal ? "fal" : keys.replicate ? "replicate" : null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
      <span className="min-w-0 flex-1">
        You&apos;re on the free <b>Test provider</b>: images and clips are placeholder gradients and nothing is sent to an AI service.
        {!target && <> Add a fal.ai key in <Link href="/settings" className="underline">Settings</Link> to generate real footage.</>}
      </span>
      {target && (
        <Button
          size="sm"
          onClick={async () => {
            await api("/api/settings", { method: "PUT", json: { default_provider: target } });
            toast.success(`Now generating with ${target === "fal" ? "fal.ai" : "Replicate"}`);
            onChange();
          }}
        >
          Use {target === "fal" ? "fal.ai" : "Replicate"}
        </Button>
      )}
    </div>
  );
}
