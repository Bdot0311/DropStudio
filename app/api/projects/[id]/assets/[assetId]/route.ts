import { removeAsset } from "@/lib/projects";
import { json } from "@/lib/http";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await params;
  removeAsset(id, assetId);
  return json({ ok: true });
}
