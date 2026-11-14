import { totalSpend } from "@/lib/projects";
import { json } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  return json({ total_usd: totalSpend() });
}
