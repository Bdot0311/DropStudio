"use client";
import useSWR from "swr";
import { DollarSign } from "lucide-react";
import { fetcher } from "@/lib/utils";

/** Running total of money spent on AI generation across all projects. */
export function SpendCounter() {
  const { data } = useSWR<{ total_usd: number }>("/api/spend", fetcher, { refreshInterval: 5000 });
  return (
    <div className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground" title="Total spent on AI generation (all projects)">
      <DollarSign className="h-3.5 w-3.5" />
      <span className="font-mono tabular-nums text-foreground">{(data?.total_usd ?? 0).toFixed(2)}</span>
      <span>spent</span>
    </div>
  );
}
