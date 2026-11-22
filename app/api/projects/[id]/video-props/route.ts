import { buildVideoProps } from "@/lib/render-props";
import { error, json } from "@/lib/http";

export const runtime = "nodejs";

/** Props for the in-browser preview player (same composition the renderer uses). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { props } = buildVideoProps(id, {
      assetUrl: (rel) => (rel.startsWith("cache/") ? `/api/${rel}` : `/api/projects/${id}/files/${rel}`),
      withAudio: true,
    });
    return json(props);
  } catch (e) {
    return error((e as Error).message, 409);
  }
}
