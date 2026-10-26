import type { Rect } from "./geometry";
import type { Rng } from "./rng";

export type BiomeId = "bos" | "dorp" | "stad" | "haven" | "jungle" | "woestijn" | "bergen" | "campus";

/** 0 = new (fog), 1 = started/current (construction), 2 = done (alive). */
export type Stage = 0 | 1 | 2;

export type PieceCtx = { x: number; y: number; side: 1 | -1; stage: Stage; current: boolean; rng: Rng };

export type SetPiece = {
  id: string;
  biome: BiomeId;
  /**
   * Footprint rects relative to the anchor (the piece's baseline point), for a piece facing
   * `side` (the direction towards the road; mirror the art by it). Keep the footprint within
   * 110×110: the engine tries several slots around the node, and larger pieces rarely fit.
   */
  footprint: (side: 1 | -1) => Rect[];
  render: (ctx: PieceCtx) => string;
};

export type Flora = { weight: number; render: (x: number, y: number, rng: Rng, scale: number) => string; radius: number };

export type Biome = {
  id: BiomeId;
  ground: [string, string];
  flora: Flora[];
  pieces: SetPiece[];
  /** i18n key */
  banner: string;
};
