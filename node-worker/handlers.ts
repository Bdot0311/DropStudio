// Additional job handlers (AI generation, export, upload) register here.
import type { Job } from "../lib/types";
import type { Ctx } from "./render";

export const EXTRA_HANDLERS: Record<string, (job: Job, ctx: Ctx) => Promise<unknown>> = {};
