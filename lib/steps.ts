export const STEPS = [
  { slug: "upload", label: "Upload", phase: 1 },
  { slug: "analyze", label: "Analyze", phase: 1 },
  { slug: "style", label: "Style", phase: 2 },
  { slug: "storyboard", label: "Storyboard", phase: 3 },
  { slug: "generate", label: "Generate", phase: 3 },
  { slug: "render", label: "Render", phase: 2 },
  { slug: "publish", label: "Publish", phase: 4 },
] as const;
export type StepSlug = (typeof STEPS)[number]["slug"];
