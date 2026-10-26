export type Rect = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };

export type ZoneTag = "node" | "levelbar" | "bubble" | "road" | "piece" | "banner";
export type RectZone = Rect & { kind: "rect"; tag: ZoneTag };
export type Circle = { kind: "circle"; tag: ZoneTag; cx: number; cy: number; r: number };
/** One capsule of the road corridor: a polyline segment of the road, inflated by `r`. */
export type RoadZone = { kind: "road"; tag: ZoneTag; x1: number; y1: number; x2: number; y2: number; r: number };
export type Zone = RectZone | Circle | RoadZone;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Squared distance from a point to a rect (0 inside). Squared to avoid slow Math.hypot. */
function rectPointDist2(r: Rect, x: number, y: number): number {
  const dx = x - clamp(x, r.x, r.x + r.w);
  const dy = y - clamp(y, r.y, r.y + r.h);
  return dx * dx + dy * dy;
}

export function rectPointDist(r: Rect, x: number, y: number): number {
  return Math.sqrt(rectPointDist2(r, x, y));
}

function segPointDist2(x1: number, y1: number, x2: number, y2: number, px: number, py: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
  const ex = px - (x1 + t * dx);
  const ey = py - (y1 + t * dy);
  return ex * ex + ey * ey;
}

/** Liang–Barsky: does the segment touch the rect? */
function segHitsRect(x1: number, y1: number, x2: number, y2: number, r: Rect): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) t0 = t > t0 ? t : t0;
    else t1 = t < t1 ? t : t1;
    return t0 <= t1;
  };
  return (
    clip(-dx, x1 - r.x) && clip(dx, r.x + r.w - x1) && clip(-dy, y1 - r.y) && clip(dy, r.y + r.h - y1)
  );
}

/** Squared segment–rect distance (0 when they touch). */
function segRectDist2(x1: number, y1: number, x2: number, y2: number, r: Rect): number {
  if (segHitsRect(x1, y1, x2, y2, r)) return 0;
  return Math.min(
    rectPointDist2(r, x1, y1),
    rectPointDist2(r, x2, y2),
    segPointDist2(x1, y1, x2, y2, r.x, r.y),
    segPointDist2(x1, y1, x2, y2, r.x + r.w, r.y),
    segPointDist2(x1, y1, x2, y2, r.x, r.y + r.h),
    segPointDist2(x1, y1, x2, y2, r.x + r.w, r.y + r.h),
  );
}

export function intersects(zone: Zone, rect: Rect): boolean {
  switch (zone.kind) {
    case "rect":
      return rectsOverlap(zone, rect);
    case "circle":
      return rectPointDist2(rect, zone.cx, zone.cy) <= zone.r * zone.r;
    case "road": {
      // Cheap reject: rect outside the capsule's bounding box.
      const { x1, y1, x2, y2, r } = zone;
      if (rect.x > Math.max(x1, x2) + r || rect.x + rect.w < Math.min(x1, x2) - r) return false;
      if (rect.y > Math.max(y1, y2) + r || rect.y + rect.h < Math.min(y1, y2) - r) return false;
      return segRectDist2(x1, y1, x2, y2, rect) <= r * r;
    }
  }
}

export function pointInZones(x: number, y: number, zones: readonly Zone[]): boolean {
  const p = { x, y, w: 0, h: 0 };
  return zones.some((z) => intersects(z, p));
}

/** Vertical extent of a zone, for bucketing. */
function zoneYRange(z: Zone): [number, number] {
  switch (z.kind) {
    case "rect":
      return [z.y, z.y + z.h];
    case "circle":
      return [z.cy - z.r, z.cy + z.r];
    case "road":
      return [Math.min(z.y1, z.y2) - z.r, Math.max(z.y1, z.y2) + z.r];
  }
}

/** Zones bucketed by y so hit tests only look at nearby zones. */
export class ZoneIndex {
  readonly zones: Zone[] = [];
  private buckets = new Map<number, Zone[]>();
  constructor(private bucket = 64) {}

  add(z: Zone): void {
    this.zones.push(z);
    const [a, b] = zoneYRange(z);
    for (let k = Math.floor(a / this.bucket); k <= Math.floor(b / this.bucket); k++) {
      let list = this.buckets.get(k);
      if (!list) this.buckets.set(k, (list = []));
      list.push(z);
    }
  }

  hits(rect: Rect): boolean {
    for (let k = Math.floor(rect.y / this.bucket); k <= Math.floor((rect.y + rect.h) / this.bucket); k++) {
      const list = this.buckets.get(k);
      if (list) for (const z of list) if (intersects(z, rect)) return true;
    }
    return false;
  }
}
