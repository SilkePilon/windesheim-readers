import { describe, expect, test } from "bun:test";
import { navDirection } from "../src/lib/motion";

const at = (path: string) => {
  const [pathname, q] = path.split("?");
  return { pathname: pathname!, search: q ? `?${q}` : "" };
};

describe("navDirection", () => {
  test("tabs follow dock order", () => {
    expect(navDirection(at("/"), at("/leaderboard"))).toBe("forward");
    expect(navDirection(at("/profile"), at("/battle"))).toBe("back");
    expect(navDirection(at("/admin/users"), at("/admin"))).toBe("back");
    expect(navDirection(at("/admin"), at("/admin/settings"))).toBe("forward");
  });

  test("deeper is forward, up the hierarchy is back", () => {
    expect(navDirection(at("/"), at("/lesson/a"))).toBe("forward");
    expect(navDirection(at("/lesson/a"), at("/"))).toBe("back");
    expect(navDirection(at("/lesson/a"), at("/lesson/a/quiz"))).toBe("forward");
    expect(navDirection(at("/lesson/a/quiz"), at("/lesson/a"))).toBe("back");
    expect(navDirection(at("/lesson/a"), at("/lesson/a?view=read"))).toBe("forward");
    expect(navDirection(at("/lesson/a?view=read"), at("/lesson/a"))).toBe("back");
    expect(navDirection(at("/battle"), at("/battle/ABCD"))).toBe("forward");
  });

  test("history pops and explicit hints win", () => {
    expect(navDirection(at("/"), at("/lesson/a"), { pop: "back" })).toBe("back");
    expect(navDirection(at("/lesson/a"), at("/"), { pop: "forward" })).toBe("forward");
    expect(navDirection(at("/lesson/b?view=read"), at("/lesson/a?view=read"), { hint: { navDir: "back" } })).toBe("back");
    expect(navDirection(at("/lesson/a?view=read"), at("/lesson/b?view=read"), { hint: null })).toBe("forward");
  });
});
