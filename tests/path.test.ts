import { expect, test, describe } from "bun:test";
import { pathNodes } from "../shared/path";

const L = (id: string, week: number, mastery: number) => ({ id, code: id, title: id, week, mastery });
const states = (g: ReturnType<typeof pathNodes>) => g.flatMap((x) => x.nodes.map((n) => n.state));

describe("pathNodes", () => {
  test("no progress", () => {
    expect(pathNodes([L("1.1A", 1, 0), L("1.1B", 1, 0)], null)[0]!.nodes.map((n) => n.state)).toEqual(["current", "new"]);
  });
  test("last studied not done", () => {
    expect(states(pathNodes([L("a", 1, 0.9), L("b", 1, 0.3), L("c", 2, 0)], "b"))).toEqual(["done", "current", "new"]);
  });
  test("last studied done", () => {
    expect(states(pathNodes([L("a", 1, 0.9), L("b", 1, 0.2), L("c", 2, 0)], "a"))).toEqual(["done", "current", "new"]);
    expect(states(pathNodes([L("a", 1, 0.2), L("b", 1, 0), L("c", 2, 0)], "b"))).toEqual(["started", "current", "new"]);
  });
  test("all done", () => {
    expect(pathNodes([L("a", 1, 1)], "a")[0]!.nodes[0]!.state).toBe("done");
  });
  test("empty and ordering", () => {
    expect(pathNodes([], null)).toEqual([]);
    expect(pathNodes([L("a", 2, 0), L("b", 1, 0)], null).map((g) => g.week)).toEqual([1, 2]);
  });
});
