import { lessonLevel } from "./levels";

export const DONE_MASTERY = 0.8;

export type PathNodeState = "done" | "current" | "started" | "new";

export interface PathNode {
  id: string;
  code: string;
  title: string;
  week: number;
  mastery: number;
  level: number;
  state: PathNodeState;
}

export interface PathGroup {
  week: number;
  nodes: PathNode[];
}

export type LessonSummaryLike = { id: string; code: string; title: string; week: number; mastery: number };

/** Groups in ascending week order; nodes keep input order. The client reverses for display. */
export function pathNodes(lessons: LessonSummaryLike[], lastStudiedLessonId: string | null): PathGroup[] {
  const weeks = [...new Set(lessons.map((l) => l.week))].sort((a, b) => a - b);
  const ordered = weeks.flatMap((w) => lessons.filter((l) => l.week === w));

  const last = lastStudiedLessonId ? ordered.find((l) => l.id === lastStudiedLessonId) : undefined;
  const current = last && last.mastery < DONE_MASTERY ? last : ordered.find((l) => l.mastery < DONE_MASTERY);

  return weeks.map((week) => ({
    week,
    nodes: ordered
      .filter((l) => l.week === week)
      .map((l): PathNode => ({
        id: l.id,
        code: l.code,
        title: l.title,
        week: l.week,
        mastery: l.mastery,
        level: lessonLevel(l.mastery),
        state:
          l.id === current?.id ? "current" : l.mastery >= DONE_MASTERY ? "done" : l.mastery > 0 ? "started" : "new",
      })),
  }));
}
