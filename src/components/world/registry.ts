import type { BiomeId } from "@/lib/world/types";
import type { WorldBiome } from "./kit";
import { bos } from "./biomes/bos";
import { dorp } from "./biomes/dorp";
import { stad } from "./biomes/stad";
import { haven } from "./biomes/haven";
import { jungle } from "./biomes/jungle";
import { woestijn } from "./biomes/woestijn";
import { bergen } from "./biomes/bergen";
import { campus } from "./biomes/campus";

export const REGISTRY: Record<BiomeId, WorldBiome> = { bos, dorp, stad, haven, jungle, woestijn, bergen, campus };
