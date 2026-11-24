// The Director: designs every shot like a Higgsfield / OpenArt music video.
//   • shot type (wide, close-up, low angle, silhouette…) varied across the video
//   • a named camera move for the video model (crash zoom, 360 orbit, bullet time, FPV dive…)
//   • a VFX moment (particles, lightning, levitation, light trails…) on the big sections
//   • one consistent world + wardrobe so it feels like one film
// Keyframes get a cinematic still prompt; the image-to-video model gets a separate motion prompt.
import type { SectionType } from "./types";

export type Option = { id: string; label: string; prompt: string };

export const CAMERA_MOVES: Option[] = [
  { id: "crash_zoom", label: "Crash zoom", prompt: "sudden fast crash zoom straight into the subject" },
  { id: "orbit_360", label: "360° orbit", prompt: "camera orbits a full 360 degrees around the subject, smooth and fast" },
  { id: "bullet_time", label: "Bullet time", prompt: "bullet-time: the moment freezes in slow motion while the camera sweeps around the subject" },
  { id: "fpv_dive", label: "FPV dive", prompt: "FPV drone shot diving fast through the scene and pulling up past the subject" },
  { id: "dolly_in", label: "Dolly in", prompt: "slow cinematic dolly in toward the subject" },
  { id: "crane_up", label: "Crane up", prompt: "crane shot rising up and away, revealing the whole scene" },
  { id: "push_through", label: "Push through", prompt: "camera pushes forward fast through the scene, objects rushing past the lens" },
  { id: "dolly_zoom", label: "Dolly zoom", prompt: "dolly zoom vertigo effect, the background stretches away behind the subject" },
  { id: "lazy_susan", label: "Slow turn", prompt: "camera slowly rotates around the subject at eye level" },
  { id: "handheld", label: "Handheld follow", prompt: "energetic handheld tracking shot following the subject" },
  { id: "whip_pan", label: "Whip pan", prompt: "fast whip pan onto the subject with motion blur" },
  { id: "static", label: "Locked off", prompt: "locked-off static camera, only the subject and the elements move" },
];

export const VFX: Option[] = [
  { id: "none", label: "None", prompt: "" },
  { id: "particles", label: "Particle burst", prompt: "the subject bursts into thousands of glowing particles that swirl and reassemble" },
  { id: "lightning", label: "Lightning", prompt: "bolts of lightning crack across the sky behind the subject" },
  { id: "levitate", label: "Levitation", prompt: "the subject slowly levitates off the ground as dust floats upward" },
  { id: "light_trails", label: "Light trails", prompt: "neon light trails streak and spiral around the subject" },
  { id: "wind", label: "Slow-mo wind", prompt: "strong wind blows hair and clothes in dramatic slow motion" },
  { id: "shatter", label: "Shatter", prompt: "glass shatters all around in extreme slow motion, shards catching the light" },
  { id: "rain", label: "Rain", prompt: "heavy rain falls in slow motion, droplets glowing in the light" },
  { id: "smoke", label: "Smoke burst", prompt: "thick smoke bursts outward from the ground and rolls through the light beams" },
  { id: "lasers", label: "Lasers", prompt: "laser beams sweep through haze and lock onto the subject" },
];

export const SHOT_TYPES: Option[] = [
  { id: "extreme_wide", label: "Extreme wide", prompt: "extreme wide establishing shot, the subject small in a vast landscape" },
  { id: "wide", label: "Wide", prompt: "wide shot" },
  { id: "medium", label: "Medium", prompt: "medium shot from the waist up" },
  { id: "close_up", label: "Close-up", prompt: "close-up on the face" },
  { id: "extreme_close_up", label: "Extreme close-up", prompt: "extreme close-up on the eyes" },
  { id: "low_angle", label: "Low angle", prompt: "dramatic low-angle hero shot looking up at the subject" },
  { id: "high_angle", label: "Top down", prompt: "high-angle top-down shot" },
  { id: "silhouette", label: "Silhouette", prompt: "backlit silhouette against a bright light source" },
];

const byId = (list: Option[], id: string) => list.find((o) => o.id === id);

/** What happens in each section, as a short story beat. */
const SECTION_PLAN: Record<SectionType, { shots: string[]; cams: string[]; vfx: string[]; action: string[] }> = {
  intro: { shots: ["extreme_wide", "silhouette", "wide"], cams: ["crane_up", "dolly_in", "lazy_susan"], vfx: ["none", "smoke", "none"], action: ["standing still, waiting", "walking slowly forward", "looking out over the scene"] },
  build: { shots: ["medium", "close_up", "low_angle"], cams: ["push_through", "dolly_in", "dolly_zoom"], vfx: ["wind", "rain", "light_trails"], action: ["clenching fists as energy builds", "looking up as light grows", "starting to move to the beat"] },
  drop: { shots: ["low_angle", "medium", "close_up", "wide"], cams: ["crash_zoom", "orbit_360", "bullet_time", "fpv_dive"], vfx: ["particles", "lightning", "light_trails", "shatter", "lasers"], action: ["dancing with full energy, arms raised", "jumping as the beat hits", "spinning with wild energy", "commanding the crowd"] },
  breakdown: { shots: ["close_up", "silhouette", "extreme_close_up"], cams: ["lazy_susan", "static", "dolly_in"], vfx: ["levitate", "smoke", "none"], action: ["eyes closed, breathing slowly", "floating in stillness", "reaching out toward the light"] },
  outro: { shots: ["wide", "extreme_wide"], cams: ["crane_up", "dolly_in"], vfx: ["none", "smoke"], action: ["walking away into the light", "standing alone as the light fades"] },
};

/** A consistent world + wardrobe per genre (the user can edit both on the Storyboard). */
export const DEFAULT_WORLD: Record<string, { world: string; wardrobe: string }> = {
  melodic: { world: "a vast desert of glowing dunes and ancient stone monoliths at blue hour, mist in the air", wardrobe: "a long flowing dark coat" },
  tech_house: { world: "a sun-drenched rooftop at golden hour above a city, then a brick warehouse full of warm haze", wardrobe: "an open shirt, gold chain and sunglasses" },
  techno: { world: "a brutalist concrete bunker full of smoke, white strobes and red lasers", wardrobe: "an all-black outfit with a hood" },
  future_rave: { world: "a neon megacity at night with chrome towers and holographic signs", wardrobe: "a reflective silver jacket" },
};

export type DirectedShot = { shot_type: string; camera: string; vfx: string; prompt: string };

/** Design shot n (0-based) of a section. Deterministic, varied across the video. */
export function directShot(opts: {
  section: SectionType; n: number; globalN: number; character: boolean; vibe: string; world: string; wardrobe: string;
}): DirectedShot {
  const plan = SECTION_PLAN[opts.section];
  const pick = <T,>(arr: T[], k: number) => arr[k % arr.length];
  // n = how many shots of this section type came before: each list rotates independently,
  // so consecutive builds/drops never repeat the same camera move.
  const shot_type = pick(plan.shots, opts.n);
  const camera = pick(plan.cams, opts.n);
  const vfx = pick(plan.vfx, opts.n);
  const subject = opts.character ? `the person from the reference photo, wearing ${opts.wardrobe},` : "a lone figure seen from behind,";
  const action = pick(plan.action, opts.n);
  const st = byId(SHOT_TYPES, shot_type)!.prompt;
  const vibe = opts.vibe ? `, ${opts.vibe}` : "";
  const prompt = `${st} of ${subject} ${action}, in ${opts.world}${vibe}, cinematic film still, dramatic lighting, shallow depth of field, anamorphic`;
  return { shot_type, camera, vfx, prompt };
}

/** The image-to-video prompt: camera move + action + VFX. This is what makes the clip move like a music video. */
export function motionPrompt(shot: { prompt: string; camera?: string | null; vfx?: string | null }): string {
  const cam = byId(CAMERA_MOVES, shot.camera ?? "")?.prompt;
  const fx = byId(VFX, shot.vfx ?? "")?.prompt;
  const base = shot.prompt.replace(/,?\s*cinematic film still.*$/i, "");
  return [cam, base, fx, "cinematic music video, dynamic, smooth motion, highly detailed"].filter(Boolean).join(". ");
}
