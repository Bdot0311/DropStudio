"use client";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

/** Always-visible spend vs. budget for this project. */
export function CostMeter({ spent, cap, provider }: { spent: number; cap: number; provider: string }) {
  const frac = cap > 0 ? spent / cap : 1;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-2.5 text-sm">
      <Wallet className="h-4 w-4 text-muted-foreground" />
      <span>
        <span className="font-mono font-semibold tabular-nums">${spent.toFixed(2)}</span>
        <span className="text-muted-foreground"> of ${cap.toFixed(2)} project budget spent</span>
      </span>
      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-secondary">
        <div className={cn("h-full rounded-full", frac > 0.9 ? "bg-destructive" : frac > 0.7 ? "bg-warning" : "bg-success")} style={{ width: `${Math.min(100, frac * 100)}%` }} />
      </div>
      <span className="ml-auto text-xs text-muted-foreground">
        Provider: <span className="text-foreground">{provider}</span> ·{" "}
        <Link href="/settings" className="underline">change</Link>
      </span>
    </div>
  );
}
