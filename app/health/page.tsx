"use client";
import useSWR from "swr";
import { CheckCircle2, CircleDashed, Loader2, RefreshCw, TriangleAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetcher } from "@/lib/utils";
import type { Check } from "@/lib/health";

const ICON = {
  ok: <CheckCircle2 className="h-5 w-5 text-success" />,
  warn: <TriangleAlert className="h-5 w-5 text-warning" />,
  error: <XCircle className="h-5 w-5 text-destructive" />,
  off: <CircleDashed className="h-5 w-5 text-muted-foreground" />,
};

export default function HealthPage() {
  const { data, isValidating, mutate } = useSWR<{ checks: Check[]; system: Record<string, string> }>("/api/health", fetcher);
  const required = data?.checks.filter((c) => !c.optional) ?? [];
  const optional = data?.checks.filter((c) => c.optional) ?? [];
  const problems = required.filter((c) => c.status === "error").length;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Health</h1>
          <p className="text-sm text-muted-foreground">
            {!data ? "Checking components…" : problems ? `${problems} required component${problems > 1 ? "s" : ""} need attention.` : "Everything required is installed and working."}
          </p>
        </div>
        <Button variant="outline" onClick={() => mutate()} disabled={isValidating}>
          {isValidating ? <Loader2 className="animate-spin" /> : <RefreshCw />} Re-check
        </Button>
      </div>
      <Section title="Required" checks={required} />
      <Section title="Optional" checks={optional} />
      {data && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
          {Object.entries(data.system).map(([k, v]) => (
            <div key={k}>
              <span className="uppercase tracking-wider">{k}</span>
              <div className="text-foreground">{v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ title, checks }: { title: string; checks: Check[] }) {
  if (!checks.length) return null;
  return (
    <div className="space-y-2">
      <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h2>
      <Card>
        <CardContent className="divide-y p-0">
          {checks.map((c) => (
            <div key={c.id} className="flex gap-3 p-4">
              <div className="pt-0.5">{ICON[c.status]}</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.detail}</div>
                {c.fix && (
                  <div className="mt-2 rounded-md bg-secondary px-3 py-2 font-mono text-xs">
                    <span className="mr-2 font-sans text-muted-foreground">{c.status === "off" ? "Install:" : "Fix:"}</span>
                    {c.fix}
                  </div>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
