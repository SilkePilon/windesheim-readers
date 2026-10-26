import { expect, test, describe, spyOn } from "bun:test";
import { awardWithQuests, type AwardDeps } from "../server/lib/award";
import type { XpResult } from "../server/lib/game";

const base: XpResult = { xp: 95, gained: 10, streak: 1, newBadges: [] };
const awardXp: AwardDeps["awardXp"] = async () => ({ ...base, newBadges: [] });

describe("awardWithQuests", () => {
  test("a throwing quest recorder does not fail the award", async () => {
    const err = spyOn(console, "error").mockImplementation(() => {});
    const res = await awardWithQuests(
      { awardXp, recordQuestEvent: async () => { throw new Error("SQLITE_BUSY"); } },
      "u1", 10, "quiz", [{ kind: "card_review" }],
    );
    expect(res).toEqual(base);
    expect(res.quests).toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  test("quest reward XP is folded into xp/gained", async () => {
    let calls = 0;
    const res = await awardWithQuests(
      {
        awardXp,
        recordQuestEvent: async () =>
          ++calls === 1
            ? { completed: ["quiz_80"], reward: 15, xp: 110, newBadges: ["streak_3"] }
            : { completed: [], reward: 0, newBadges: [] },
      },
      "u1", 10, "quiz", [{ kind: "quiz_submit", pct: 1, lessonId: "l" }],
    );
    expect(res).toMatchObject({ xp: 110, gained: 25, quests: ["quiz_80"], newBadges: ["streak_3"] });
  });

  test("no completed quests: the plain award result", async () => {
    const res = await awardWithQuests(
      { awardXp, recordQuestEvent: async () => ({ completed: [], reward: 0, newBadges: [] }) },
      "u1", 10, "summary",
    );
    expect(res).toEqual(base);
  });
});
