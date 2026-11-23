import { getSetting } from "../settings";
import type { ProviderId } from "../models";
import { comfyProvider } from "./comfyui";
import { falProvider } from "./fal";
import { mockProvider } from "./mock";
import { replicateProvider } from "./replicate";
import type { Provider } from "./types";

export function getProvider(id: ProviderId): Provider {
  switch (id) {
    case "fal": return falProvider(getSetting("fal_key"));
    case "replicate": return replicateProvider(getSetting("replicate_token"));
    case "comfyui": return comfyProvider(getSetting("comfyui_url"));
    default: return mockProvider();
  }
}
