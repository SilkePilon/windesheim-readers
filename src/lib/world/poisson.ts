import type { Point, Rect } from "./geometry";
import type { Rng } from "./rng";

/**
 * Bridson Poisson-disc sampling over `bounds`. The full set is grown over the whole rect (so
 * exclusion zones such as the road can't cut off regions), then filtered by `accept`.
 */
export function poisson(
  rng: Rng,
  bounds: Rect,
  minDist: number,
  accept: (x: number, y: number) => boolean,
  k = 20,
): Point[] {
  if (bounds.w <= 0 || bounds.h <= 0) return [];
  const { x: bx, y: by, w: bw, h: bh } = bounds;
  const cell = minDist / Math.SQRT2;
  const cols = Math.ceil(bw / cell);
  const rows = Math.ceil(bh / cell);
  const grid = new Int32Array(cols * rows).fill(-1);
  // Upper bound on points: one per cell.
  const xs = new Float64Array(cols * rows);
  const ys = new Float64Array(cols * rows);
  const active = new Int32Array(cols * rows);
  let count = 0;
  let nActive = 0;
  const r2 = minDist * minDist;

  const insert = (x: number, y: number) => {
    xs[count] = x;
    ys[count] = y;
    active[nActive++] = count;
    grid[Math.floor((y - by) / cell) * cols + Math.floor((x - bx) / cell)] = count++;
  };
  const fits = (x: number, y: number) => {
    if (x < bx || y < by || x >= bx + bw || y >= by + bh) return false;
    const gx = Math.floor((x - bx) / cell);
    const gy = Math.floor((y - by) / cell);
    if (grid[gy * cols + gx] >= 0) return false;
    const y0 = gy > 1 ? gy - 2 : 0;
    const y1 = gy < rows - 2 ? gy + 2 : rows - 1;
    const x0 = gx > 1 ? gx - 2 : 0;
    const x1 = gx < cols - 2 ? gx + 2 : cols - 1;
    for (let yy = y0; yy <= y1; yy++)
      for (let xx = x0; xx <= x1; xx++) {
        const j = grid[yy * cols + xx];
        if (j >= 0) {
          const dx = xs[j] - x;
          const dy = ys[j] - y;
          if (dx * dx + dy * dy < r2) return false;
        }
      }
    return true;
  };

  insert(bx + rng() * bw, by + rng() * bh);
  while (nActive) {
    const ai = Math.floor(rng() * nActive);
    const pi = active[ai];
    const px = xs[pi];
    const py = ys[pi];
    let placed = false;
    for (let t = 0; t < k; t++) {
      // Uniform-ish point in the annulus [r, 2r] by rejection from the square (no trig).
      const dx = (rng() * 4 - 2) * minDist;
      const dy = (rng() * 4 - 2) * minDist;
      const dd = dx * dx + dy * dy;
      if (dd < r2 || dd > 4 * r2) continue;
      const x = px + dx;
      const y = py + dy;
      if (fits(x, y)) {
        insert(x, y);
        placed = true;
        break;
      }
    }
    if (!placed) active[ai] = active[--nActive];
  }
  const out: Point[] = [];
  for (let i = 0; i < count; i++) if (accept(xs[i], ys[i])) out.push({ x: xs[i], y: ys[i] });
  return out;
}
