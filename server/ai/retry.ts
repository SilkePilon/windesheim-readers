import type { LessonStatus, ReaderStatus } from "../../src/lib/types";

export type RetryAction = { kind: "extract" } | { kind: "generate"; lessonIds: string[] } | { kind: "none" };

/** Pure. Never returns an action that deletes lessons (extract is only possible when there are none). */
export function retryAction(
  reader: { status: ReaderStatus; error: string | null },
  lessons: { id: string; status: LessonStatus }[],
): RetryAction {
  const failed = lessons.filter((l) => l.status === "error" || l.status === "pending").map((l) => l.id);
  if (reader.status === "error") {
    if (lessons.length === 0) return { kind: "extract" };
    return failed.length ? { kind: "generate", lessonIds: failed } : { kind: "none" };
  }
  if (reader.status === "ready" && reader.error && failed.length) return { kind: "generate", lessonIds: failed };
  return { kind: "none" };
}
