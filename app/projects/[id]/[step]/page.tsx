import { notFound } from "next/navigation";
import { Construction } from "lucide-react";
import { STEPS } from "@/lib/steps";

const BLURB: Record<string, string> = {
  style: "Pick a render mode and preset, tweak palette, intensity and cut rhythm, and watch a live 10-second preview of your drop.",
  storyboard: "Shot prompts mapped to your sections, keyframe images to approve or reject, and a cost meter that's always visible.",
  generate: "A queue of image-to-video clips with per-clip progress, cost, and retry. Clips appear as they arrive.",
  render: "Full preview in the player, quality settings, then a chunked, resumable render to MP4 with your original audio.",
  publish: "Shorts trimmer, thumbnail picker, metadata editor, export package and (optionally) YouTube upload.",
};

export default async function ComingSoon({ params }: { params: Promise<{ id: string; step: string }> }) {
  const { step } = await params;
  const s = STEPS.find((x) => x.slug === step);
  if (!s) notFound();
  return (
    <div className="mx-auto max-w-xl p-10 text-center">
      <Construction className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
      <h2 className="text-lg font-semibold">{s.label} arrives in Phase {s.phase}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{BLURB[step]}</p>
    </div>
  );
}
