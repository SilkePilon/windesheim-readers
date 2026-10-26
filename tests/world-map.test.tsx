import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import nl from "../src/locales/nl";
import { WorldMap } from "../src/components/world/world-map";
import { REGISTRY } from "../src/components/world/registry";
import { composeWorld } from "../src/lib/world/compose";
import type { PathGroup } from "../shared/path";

const i18n = i18next.createInstance();
await i18n.use(initReactI18next).init({
  resources: { nl: { translation: nl } },
  lng: "nl",
  interpolation: { escapeValue: false },
  returnObjects: true,
});

const groups: PathGroup[] = [
  {
    week: 1,
    nodes: [
      { id: "a", code: "1.1", title: "Intro", week: 1, mastery: 1, level: 5, state: "done" },
      { id: "b", code: "1.2", title: "Cellen", week: 1, mastery: 0.4, level: 2, state: "current" },
    ],
  },
  { week: 2, nodes: [{ id: "c", code: "2.1", title: "Weefsels", week: 2, mastery: 0, level: 0, state: "new" }] },
];

const html = renderToString(
  <I18nextProvider i18n={i18n}>
    <WorldMap seed="reader-x" groups={groups} onOpen={() => {}} />
  </I18nextProvider>,
);
const layout = composeWorld(
  { seed: "reader-x", lessons: groups.flatMap((g) => g.nodes).map((n) => ({ id: n.id, code: "", week: n.week, state: n.state, level: 0, mastery: 0 })) },
  REGISTRY,
);
const doc = scanTags(html);

/** Minimal tag scanner: bun test has no DOM. Returns the attributes of every opening tag. */
function scanTags(src: string) {
  const tags: { name: string; attrs: Record<string, string>; index: number }[] = [];
  const re = /<([a-zA-Z0-9]+)((?:\s+[^\s=>]+(?:="[^"]*")?)*)\s*\/?>/g;
  for (let m; (m = re.exec(src)); ) {
    const attrs: Record<string, string> = {};
    for (const a of m[2].matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] ?? "";
    tags.push({ name: m[1].toLowerCase(), attrs, index: m.index });
  }
  return { tags };
}
const unescape = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'");

describe("WorldMap node layer", () => {
  const buttons = doc.tags.filter((t) => t.name === "button");
  const nodeButtons = buttons.filter((b) => "data-state" in b.attrs);

  test("every lesson is a labelled button", () => {
    expect(nodeButtons).toHaveLength(3);
    const labels = nodeButtons.map((b) => unescape(b.attrs["aria-label"]));
    expect(labels).toContain("1.1: Intro, klaar");
    expect(labels).toContain("1.2: Cellen, bezig");
    expect(labels).toContain("2.1: Weefsels, nieuw");
  });

  test("only the current lesson has aria-current=step", () => {
    const cur = nodeButtons.filter((b) => b.attrs["aria-current"] === "step");
    expect(cur).toHaveLength(1);
    expect(cur[0].attrs["data-state"]).toBe("current");
  });

  test("nodes sit at the layout's percentage positions", () => {
    const anchors = doc.tags.filter((t) => t.name === "div" && /left:/.test(t.attrs.style ?? ""));
    expect(anchors).toHaveLength(3);
    const found = anchors.map((a) => a.attrs.style);
    for (const n of layout.nodes) {
      const left = (n.x / 390) * 100;
      const top = (n.y / layout.height) * 100;
      expect(found).toContain(`left:${left}%;top:${top}%`);
    }
  });

  test("the Ga verder bubble is hidden from assistive tech and not focusable", () => {
    const bubble = buttons.filter((b) => !("data-state" in b.attrs));
    expect(bubble).toHaveLength(1);
    expect(bubble[0].attrs["aria-hidden"]).toBe("true");
    expect(bubble[0].attrs.tabindex).toBe("-1");
    expect(html).toContain("Ga verder");
  });

  test("the bubble box stays inside its exclusion zone at 320 and 390px", () => {
    const bubble = buttons.find((b) => !("data-state" in b.attrs))!;
    const style = unescape(bubble.attrs.style);
    const calc = (prop: string) => Number(new RegExp(`(?:^|;)${prop}:calc\\((-?[\\d.]+) \\* var\\(--u\\)\\)`).exec(style)![1]);
    const cur = layout.nodes.find((n) => n.id === "b")!;
    // The zone in world units (compose.ts): 96x34, 60 to the inner side of the node.
    const zone = { x: cur.x > 195 ? cur.x - 152 : cur.x + 60, y: cur.y - 17, w: 96, h: 34 };
    for (const width of [320, 390, 520]) {
      const u = width / 390; // px per world unit
      const box = { x: (cur.x + calc("left")) * u, y: (cur.y + calc("top")) * u, w: calc("width") * u, h: calc("height") * u };
      expect(box.x).toBeGreaterThanOrEqual(zone.x * u - 1e-6);
      expect(box.y).toBeGreaterThanOrEqual(zone.y * u - 1e-6);
      expect(box.x + box.w).toBeLessThanOrEqual((zone.x + zone.w) * u + 1e-6);
      expect(box.y + box.h).toBeLessThanOrEqual((zone.y + zone.h) * u + 1e-6);
    }
  });

  test("the art container is aria-hidden and holds the svg layers", () => {
    const world = html.indexOf('<div class="world');
    expect(world).toBeGreaterThan(0);
    const container = doc.tags.filter((t) => t.name === "div" && t.index < world).at(-1)!;
    expect(container.attrs["aria-hidden"]).toBe("true");
    expect(html.match(/<svg [^>]*aria-hidden="true"/g)?.length).toBe(html.match(/<svg /g)?.length);
  });
});
