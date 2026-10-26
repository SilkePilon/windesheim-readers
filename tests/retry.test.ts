import { expect, test } from "bun:test";
import { retryAction } from "../server/ai/retry";

test("retryAction maps reader/lesson state to a safe action", () => {
  expect(retryAction({ status: "error", error: "x" }, [])).toEqual({ kind: "extract" });
  expect(retryAction({ status: "error", error: "x" }, [{ id: "a", status: "ready" }, { id: "b", status: "error" }, { id: "c", status: "pending" }])).toEqual({ kind: "generate", lessonIds: ["b", "c"] });
  expect(retryAction({ status: "ready", error: "1 lesson(s) failed" }, [{ id: "a", status: "error" }])).toEqual({ kind: "generate", lessonIds: ["a"] });
  expect(retryAction({ status: "ready", error: null }, [{ id: "a", status: "ready" }])).toEqual({ kind: "none" });
  expect(retryAction({ status: "error", error: "x" }, [{ id: "a", status: "ready" }])).toEqual({ kind: "none" });
});
