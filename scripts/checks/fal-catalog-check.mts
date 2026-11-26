// Live check against fal.ai's catalog (no key needed, nothing is generated or billed):
//   npx tsx scripts/checks/fal-catalog-check.mts [video|image|character] [limit]
// Downloads the catalog, then reads every model's schema and reports which ones Drop Studio can drive.
import { catalog, fetchSchemas, resolveFalModel, type Role } from "../../lib/fal-catalog";

const roles = (process.argv[2] ? [process.argv[2]] : ["video", "image", "character"]) as Role[];
const limit = Number(process.argv[3] ?? 1e9);
for (const role of roles) {
  const { items } = await catalog(role, true);
  const list = items.slice(0, limit);
  let ok = 0;
  const reasons: Record<string, number> = {};
  const samples: string[] = [];
  const fails: Record<string, string[]> = {};
  const models = await fetchSchemas(list.map((i) => i.id));
  for (let i = 0; i < list.length; i += 8) {
    await Promise.all(list.slice(i, i + 8).map(async (it) => {
      try {
        const d = await resolveFalModel(it.id, role, { model: models[it.id], price: it.price, save: false });
        ok++;
        if (samples.length < 6) samples.push(`${it.id} → ${JSON.stringify(d.fields)} ${JSON.stringify(d.input)} out=${d.output} ${d.clip_seconds ?? ""}s`);
      } catch (e) {
        const r = (e as Error).message.replace(/needs .*/, "needs <other inputs>");
        reasons[r] = (reasons[r] ?? 0) + 1;
        (fails[r] ??= []).push(it.id);
      }
    }));
  }
  console.log(`\n${role}: ${items.length} models in fal's catalog, ${ok}/${list.length} usable`);
  for (const s of samples) console.log("  ✓", s);
  for (const [r, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) console.log(`  ✗ ${n} × ${r}  e.g. ${fails[r].slice(0, 4).join(", ")}`);
}
