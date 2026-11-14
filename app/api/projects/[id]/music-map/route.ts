import { z } from "zod";
import { getProject, readMusicMap, writeMusicMap } from "@/lib/projects";
import { normalizeSections, phrasesFromSections } from "@/lib/grid";
import { error, json, readJson } from "@/lib/http";
import { SECTION_TYPES } from "@/lib/types";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const map = readMusicMap(id);
  if (!map) return error("Not analyzed yet", 404);
  return json(map);
}

const Edit = z.object({
  sections: z.array(z.object({ start: z.number(), end: z.number(), type: z.enum(SECTION_TYPES), energy: z.number().optional() })).min(1),
  first_downbeat: z.number().optional(),
});

/** Save hand edits: section boundaries/labels and (optionally) a corrected first downbeat. */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!getProject(id)) return error("Project not found", 404);
  const map = readMusicMap(id);
  if (!map) return error("Analyze the track first", 409);
  const parsed = Edit.safeParse(await readJson(req));
  if (!parsed.success) return error("Invalid edit: " + parsed.error.issues.map((i) => i.message).join(", "));
  const edit = parsed.data;

  if (edit.first_downbeat !== undefined) {
    const { regridDownbeats } = await import("@/lib/grid");
    map.downbeats = regridDownbeats(map.beats, edit.first_downbeat);
    map.analysis.first_downbeat = map.downbeats[0];
    map.analysis.manual_downbeat = true;
  }
  map.sections = normalizeSections(
    edit.sections.map((s) => ({ ...s, energy: s.energy ?? 0 })),
    map.downbeats,
    map.duration
  );
  map.phrases = phrasesFromSections(map.sections, map.downbeats);
  map.drops = map.sections.filter((s) => s.type === "drop").map((s) => s.start);
  map.analysis.edited = true;
  writeMusicMap(id, map);
  return json(map);
}
