import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PathGroup, PathNodeState } from "@shared/path";
import { REGISTRY } from "@/components/world/registry";
import { renderPieceTile } from "@/components/world/render";
import { WorldMap } from "@/components/world/world-map";
import "@/components/world/world.css";
import type { Stage } from "@/lib/world/types";
import { cn } from "@/lib/utils";

const STAGES: Stage[] = [0, 1, 2];
const STAGE_LABEL = ["0 · mist", "1 · bouw", "2 · af"];

/** A sample reader: `weeks` × `perWeek` lessons, the first `done` finished, then current, then a mix. */
function sample(weeks: number, perWeek: number, done: number): PathGroup[] {
  return Array.from({ length: weeks }, (_, w) => ({
    week: w + 1,
    nodes: Array.from({ length: perWeek }, (_, i) => {
      const k = w * perWeek + i;
      const state: PathNodeState = k < done ? "done" : k === done ? "current" : k % 4 === 1 ? "started" : "new";
      const mastery = state === "done" ? 1 : state === "current" ? 0.4 : state === "started" ? 0.2 : 0;
      return { id: `s${weeks}-${k}`, code: `${w + 1}.${i + 1}`, title: `Les ${k + 1}`, week: w + 1, mastery, level: Math.floor(mastery * 5), state };
    }),
  }));
}

const WORLDS = [
  { label: "3 weken", groups: sample(3, 2, 2) },
  { label: "8 weken", groups: sample(8, 2, 5) },
  { label: "12 weken", groups: sample(12, 3, 14) },
];

/** Dev-only gallery (/dev/world, `?dark` for the evening grade): every set piece × stage × side, plus sample worlds. */
export default function DevWorldPage() {
  const { t } = useTranslation();
  const [dark, setDark] = useState(() => new URLSearchParams(location.search).has("dark"));
  return (
    <div className={cn("min-h-dvh bg-background p-4 text-foreground md:p-8", dark && "dark")}>
      <div className="mb-6 flex items-center gap-3">
        <h1 className="font-heading text-2xl font-semibold">Lesson world · gallery</h1>
        <button
          type="button"
          onClick={() => setDark((d) => !d)}
          className="ml-auto rounded-[12px] bg-primary px-3 py-1.5 font-heading text-sm font-semibold text-primary-foreground"
        >
          {dark ? "Light" : "Dark"}
        </button>
      </div>

      {Object.values(REGISTRY).map((b) => (
        <section key={b.id} className="mb-8">
          <h2 className="mb-2 font-heading text-lg font-semibold">
            {t(`world.biome.${b.id}`)} <span className="text-sm text-muted-foreground">({b.pieces.length} pieces)</span>
          </h2>
          {b.pieces.map((p) => (
            <div key={p.id} className="mb-4">
              <div className="mb-1 text-sm font-bold text-muted-foreground">{p.id}</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                {STAGES.flatMap((stage) =>
                  ([1, -1] as const).map((side) => (
                    <figure key={`${stage}${side}`} className="overflow-hidden rounded-[14px] bg-card">
                      <div dangerouslySetInnerHTML={{ __html: renderPieceTile(p, stage, side) }} />
                      <figcaption className="px-2 py-1 text-xs font-bold text-muted-foreground">
                        {STAGE_LABEL[stage]} · road {side === 1 ? "→" : "←"}
                      </figcaption>
                    </figure>
                  )),
                )}
              </div>
            </div>
          ))}
        </section>
      ))}

      <h2 className="mb-3 font-heading text-lg font-semibold">Sample worlds</h2>
      <div className="flex flex-wrap items-start gap-6">
        {WORLDS.map((w) => (
          <div key={w.label} className="w-[390px] max-w-full">
            <div className="mb-1 text-sm font-bold text-muted-foreground">{w.label}</div>
            <WorldMap seed={`gallery-${w.label}`} groups={w.groups} onOpen={() => {}} />
          </div>
        ))}
      </div>
    </div>
  );
}
