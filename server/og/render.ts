import satori, { type Font } from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ReactNode } from "react";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** The brand fonts, straight from the @fontsource packages (a production dependency). */
function loadFonts(): Font[] {
  const dir = (pkg: string) => join(dirname(Bun.fileURLToPath(import.meta.resolve(pkg))), "files");
  const fonts: Font[] = [];
  // latin-ext under its own name: satori keeps one font per name and weight, but falls back
  // to any other loaded font for a missing glyph (Ł, ő, ș, ...).
  const add = (name: string, pkg: string, file: string, weights: Font["weight"][]) => {
    for (const weight of weights)
      for (const [subset, suffix] of [["latin", ""], ["latin-ext", " Ext"]] as const) {
        fonts.push({ name: name + suffix, weight, style: "normal", data: readFileSync(join(dir(pkg), `${file}-${subset}-${weight}-normal.woff`)) });
      }
  };
  add("Fredoka", "@fontsource/fredoka", "fredoka", [600, 700]);
  add("Nunito", "@fontsource/nunito", "nunito", [700, 800, 900]);
  return fonts;
}

let fonts: Font[] | null = null;
/** Loaded once, on first use. */
export const ogFonts = () => (fonts ??= loadFonts());

/**
 * Text the brand fonts can draw: Latin, Latin Extended and common punctuation. Anything else
 * (emoji, CJK, ...) would render as empty boxes, so it is dropped and spaces are collapsed.
 */
export const drawable = (s: string) =>
  s
    .normalize("NFC")
    .replace(/[^\u0020-\u007E\u00A0-\u024F\u1E00-\u1EFF\u2010-\u2027\u2030-\u205E\u20AC]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

/** A satori element tree → 1200×630 PNG. */
export async function renderPng(node: ReactNode, size = { width: OG_WIDTH, height: OG_HEIGHT }): Promise<Buffer> {
  const svg = await satori(node, { ...size, fonts: ogFonts() });
  return new Resvg(svg, { fitTo: { mode: "width", value: size.width }, font: { loadSystemFonts: false } }).render().asPng();
}
