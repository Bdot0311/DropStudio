// Spend ledger, budget cap and the generation cache. Nothing is billed twice:
// every paid call is keyed by a hash of exactly what was requested.
import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { db, nowIso } from "./db";
import { getSetting } from "./settings";

export function projectSpend(projectId: string): number {
  return (db().prepare("SELECT COALESCE(SUM(usd),0) AS s FROM spend WHERE project_id=?").get(projectId) as { s: number }).s;
}

export function budgetCap(): number {
  const n = Number(getSetting("budget_cap_usd"));
  return isFinite(n) && n >= 0 ? n : 10;
}

export class BudgetError extends Error {}

/** Throws if spending `amount` more would push the project past its cap. */
export function assertBudget(projectId: string, amount: number) {
  const spent = projectSpend(projectId);
  const cap = budgetCap();
  if (spent + amount > cap + 1e-9) {
    throw new BudgetError(
      `This would cost about $${amount.toFixed(2)}, but the project has $${Math.max(0, cap - spent).toFixed(2)} left of its $${cap.toFixed(2)} cap. Raise the cap in Settings or generate fewer items.`
    );
  }
}

export function recordSpend(e: { projectId: string; shotId: string; kind: "image" | "video"; provider: string; model: string; usd: number; cacheKey: string }) {
  db()
    .prepare("INSERT INTO spend (id, project_id, shot_id, kind, provider, model, usd, cache_key, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(nanoid(12), e.projectId, e.shotId, e.kind, e.provider, e.model, e.usd, e.cacheKey, nowIso());
  db().prepare("UPDATE projects SET spend_usd=(SELECT COALESCE(SUM(usd),0) FROM spend WHERE project_id=?) WHERE id=?").run(e.projectId, e.projectId);
}

export function cacheKey(parts: Record<string, unknown>): string {
  return crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

export type CacheEntry = { key: string; file: string; kind: string; usd: number; duration: number | null };

export function cacheGet(key: string): CacheEntry | null {
  return (db().prepare("SELECT * FROM gen_cache WHERE key=?").get(key) as CacheEntry | undefined) ?? null;
}

export function cachePut(e: { key: string; file: string; kind: string; provider: string; model: string; usd: number; duration?: number | null }) {
  db()
    .prepare("INSERT OR REPLACE INTO gen_cache (key, file, kind, provider, model, usd, duration, created_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(e.key, e.file, e.kind, e.provider, e.model, e.usd, e.duration ?? null, nowIso());
}
