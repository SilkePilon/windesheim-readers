import type { WSContext } from "hono/ws";
import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, schema } from "../db";
import { checkAnswer, correctAnswer, explanationOf, publicQuestion, shuffle } from "../lib/answers";
import { awardXp, grantBadge } from "../lib/game";
import { recordQuestEvent } from "../lib/quests";
import { displayName } from "../middleware";
import type { SessionUser } from "../auth";
import { XP } from "../../shared/game";
import { env } from "../env";
import {
  COUNT_MAX,
  COUNT_MIN,
  DEFAULT_BATTLE_SETTINGS,
  DIFFICULTIES,
  DIFFICULTY_LEVEL,
  POINTS_MODES,
  QUESTION_SECONDS,
  isDoubled,
  scoreAnswer,
  type BattleSettings,
} from "../../shared/battle";

const MAX_PLAYERS = 200;
/** "Get ready" countdown before the first question. Tests may shorten it outside production. */
const COUNTDOWN_MS = (!env.isProd && Number(process.env.BATTLE_COUNTDOWN_MS)) || 10_000;

type Q = typeof schema.question.$inferSelect;

interface Player {
  id: string;
  name: string;
  score: number;
  /**
   * Score under the default rules (normal points, both bonuses), whatever the host set:
   * XP, the winner badge and the stored attempt come from this so settings can't change them.
   */
  baseScore: number;
  streak: number;
  sockets: Set<WSContext>;
  answers: Map<number, { answer: unknown; at: number; correct: boolean; points: number }>;
}

interface Room {
  code: string;
  hostId: string;
  hostPlays: boolean;
  title: string;
  lessonIds: string[];
  /** Every mc/tf question of the chosen lessons; `questions` is picked from it. */
  pool: Q[];
  questions: Q[];
  settings: BattleSettings;
  players: Map<string, Player>;
  hostSockets: Set<WSContext>;
  state: "lobby" | "countdown" | "question" | "reveal" | "ended";
  index: number;
  startedAt: number;
  countdownEndsAt: number;
  timer?: ReturnType<typeof setTimeout>;
  lastActivity: number;
}

const rooms = new Map<string, Room>();

function newCode() {
  for (;;) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    if (!rooms.has(code)) return code;
  }
}

// Clean up abandoned rooms.
setInterval(() => {
  const cutoff = Date.now() - 1000 * 60 * 60;
  for (const [code, r] of rooms) if (r.lastActivity < cutoff) closeRoom(r);
}, 60_000).unref?.();

function closeRoom(r: Room) {
  clearTimeout(r.timer);
  // A later timer must not delete a newer room that reused the code.
  if (rooms.get(r.code) === r) rooms.delete(r.code);
}

const send = (ws: WSContext, msg: unknown) => {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    /* socket gone */
  }
};

function broadcast(r: Room, msg: unknown) {
  for (const ws of r.hostSockets) send(ws, msg);
  for (const p of r.players.values()) for (const ws of p.sockets) send(ws, msg);
}

/** `count` questions from the pool at the given difficulty, or null when fewer than 3 match. */
function pickQuestions(pool: Q[], difficulty: BattleSettings["difficulty"], count: number): Q[] | null {
  const level = DIFFICULTY_LEVEL[difficulty];
  const matching = level === null ? pool : pool.filter((q) => q.difficulty === level);
  if (matching.length < 3) return null;
  return shuffle(matching).slice(0, count);
}

const questionMs = (r: Room) => r.settings.questionSeconds * 1000;

function ranking(r: Room) {
  return [...r.players.values()]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ rank: i + 1, id: p.id, name: p.name, score: p.score, streak: p.streak }));
}

function roomState(r: Room) {
  return {
    t: "room",
    code: r.code,
    title: r.title,
    hostId: r.hostId,
    state: r.state,
    index: r.index,
    total: r.questions.length,
    settings: r.settings,
    players: ranking(r),
  };
}

function currentQuestionMsg(r: Room) {
  const q = r.questions[r.index]!;
  return {
    t: "question",
    index: r.index,
    total: r.questions.length,
    question: publicQuestion(q),
    endsAt: r.startedAt + questionMs(r),
    durationMs: questionMs(r),
    doubled: isDoubled(r.settings, r.index + 1 >= r.questions.length),
    // Lets clients correct for their own clock being off.
    serverNow: Date.now(),
  };
}

function countdownMsg(r: Room) {
  return { t: "countdown", endsAt: r.countdownEndsAt, durationMs: COUNTDOWN_MS, serverNow: Date.now() };
}

function startCountdown(r: Room) {
  r.state = "countdown";
  r.countdownEndsAt = Date.now() + COUNTDOWN_MS;
  broadcast(r, countdownMsg(r));
  broadcast(r, roomState(r));
  clearTimeout(r.timer);
  r.timer = setTimeout(() => {
    if (r.state !== "countdown") return;
    r.index = 0;
    startQuestion(r);
  }, COUNTDOWN_MS);
}

function answeredCount(r: Room) {
  return [...r.players.values()].filter((x) => x.answers.has(r.index)).length;
}

function startQuestion(r: Room) {
  r.state = "question";
  r.startedAt = Date.now();
  r.lastActivity = Date.now();
  broadcast(r, currentQuestionMsg(r));
  broadcast(r, roomState(r));
  clearTimeout(r.timer);
  r.timer = setTimeout(() => reveal(r), questionMs(r) + 300);
}

function reveal(r: Room) {
  if (r.state !== "question") return;
  clearTimeout(r.timer);
  r.state = "reveal";
  const q = r.questions[r.index]!;
  for (const p of r.players.values()) if (!p.answers.has(r.index)) p.streak = 0;
  const counts: Record<string, number> = {};
  for (const p of r.players.values()) {
    const a = p.answers.get(r.index);
    if (a) counts[JSON.stringify(a.answer)] = (counts[JSON.stringify(a.answer)] ?? 0) + 1;
  }
  broadcast(r, {
    t: "reveal",
    index: r.index,
    correctAnswer: correctAnswer(q.data),
    explanation: explanationOf(q.data),
    counts,
    results: Object.fromEntries([...r.players.values()].map((p) => [p.id, p.answers.get(r.index) ?? null])),
    ranking: ranking(r),
  });
  broadcast(r, roomState(r));
}

async function end(r: Room) {
  clearTimeout(r.timer);
  r.state = "ended";
  const rank = ranking(r);
  // Progression ranks on the base score: the host's point/bonus settings never change XP.
  const baseRank = [...r.players.values()]
    .sort((a, b) => b.baseScore - a.baseScore)
    .map((p, i) => ({ rank: i + 1, id: p.id, score: p.baseScore }));
  const xpById: Record<string, number> = {};
  for (const p of baseRank) {
    if (r.players.size < 2 && p.score === 0) continue;
    const placeXp = r.players.size >= 2 ? (XP.battlePlace[p.rank - 1] ?? 0) : 0;
    const amount = placeXp + XP.battleParticipation;
    xpById[p.id] = amount;
    await awardXp(p.id, amount, "battle")
      .then(() => recordQuestEvent(p.id, { kind: "xp", amount, reason: "battle" }))
      .catch(() => {});
    await db
      .insert(schema.attempt)
      .values({ id: nanoid(), userId: p.id, lessonId: r.lessonIds[0] ?? null, kind: "battle", score: p.score, maxScore: r.questions.length * 1000 })
      .catch(() => {});
    if (p.rank === 1 && r.players.size >= 3) await grantBadge(p.id, "battle_winner").catch(() => {});
  }
  broadcast(r, { t: "end", ranking: rank, xp: xpById });
  broadcast(r, roomState(r));
  setTimeout(() => closeRoom(r), 10 * 60_000);
}

const createMsg = z.object({
  t: z.literal("create"),
  lessonIds: z.array(z.string()).min(1).max(30),
  count: z.number().int().min(3).max(30).default(10),
  hostPlays: z.boolean().default(true),
});
const settingsPatch = z
  .object({
    questionSeconds: z.literal(QUESTION_SECONDS),
    points: z.enum(POINTS_MODES),
    count: z.number().int().min(COUNT_MIN).max(COUNT_MAX),
    difficulty: z.enum(DIFFICULTIES),
    speedBonus: z.boolean(),
    streakBonus: z.boolean(),
    showScoreboard: z.boolean(),
  })
  .partial()
  .strict();
const clientMsg = z.discriminatedUnion("t", [
  createMsg,
  z.object({ t: z.literal("join"), code: z.string().regex(/^\d{6}$/) }),
  z.object({ t: z.literal("start") }),
  z.object({ t: z.literal("answer"), index: z.number().int(), answer: z.unknown() }),
  z.object({ t: z.literal("next") }),
  z.object({ t: z.literal("settings"), settings: settingsPatch }),
  z.object({ t: z.literal("kick"), playerId: z.string() }),
  z.object({ t: z.literal("leave") }),
  z.object({ t: z.literal("end") }),
]);

/** One instance per websocket connection. */
export function battleConnection(user: SessionUser) {
  let room: Room | null = null;
  const name = displayName({ nickname: user.nickname ?? null, name: user.name, email: user.email });

  const attachPlayer = (r: Room, ws: WSContext) => {
    let p = r.players.get(user.id);
    if (!p) {
      if (r.players.size >= MAX_PLAYERS) return send(ws, { t: "error", error: "ROOM_FULL" });
      p = { id: user.id, name, score: 0, baseScore: 0, streak: 0, sockets: new Set(), answers: new Map() };
      r.players.set(user.id, p);
    }
    p.sockets.add(ws);
  };

  return {
    async onMessage(raw: string, ws: WSContext) {
      let msg: z.infer<typeof clientMsg>;
      try {
        msg = clientMsg.parse(JSON.parse(raw));
      } catch {
        return send(ws, { t: "error", error: "BAD_MESSAGE" });
      }

      if (msg.t === "create") {
        const lessons = await db
          .select({ id: schema.lesson.id, code: schema.lesson.code, published: schema.reader.published })
          .from(schema.lesson)
          .innerJoin(schema.reader, eq(schema.reader.id, schema.lesson.readerId))
          .where(inArray(schema.lesson.id, msg.lessonIds));
        const allowed = lessons.filter((l) => l.published || user.role === "admin");
        if (!allowed.length) return send(ws, { t: "error", error: "NO_LESSONS" });
        const qs = await db
          .select()
          .from(schema.question)
          .where(and(inArray(schema.question.lessonId, allowed.map((l) => l.id)), inArray(schema.question.type, ["mc", "tf"])));
        if (qs.length < 3) return send(ws, { t: "error", error: "NOT_ENOUGH_QUESTIONS" });
        const r: Room = {
          code: newCode(),
          hostId: user.id,
          hostPlays: msg.hostPlays,
          title: allowed.map((l) => l.code).join(", "),
          lessonIds: allowed.map((l) => l.id),
          pool: qs,
          questions: shuffle(qs).slice(0, msg.count),
          settings: { ...DEFAULT_BATTLE_SETTINGS, count: msg.count },
          players: new Map(),
          hostSockets: new Set([ws]),
          state: "lobby",
          index: -1,
          startedAt: 0,
          countdownEndsAt: 0,
          lastActivity: Date.now(),
        };
        rooms.set(r.code, r);
        room = r;
        if (r.hostPlays) attachPlayer(r, ws);
        return broadcast(r, roomState(r));
      }

      if (msg.t === "join") {
        const r = rooms.get(msg.code);
        if (!r) return send(ws, { t: "error", error: "ROOM_NOT_FOUND" });
        if (r.state === "ended") return send(ws, { t: "error", error: "ROOM_ENDED" });
        room = r;
        if (r.hostId === user.id) r.hostSockets.add(ws);
        if (r.hostId !== user.id || r.hostPlays) attachPlayer(r, ws);
        r.lastActivity = Date.now();
        broadcast(r, roomState(r));
        if (r.state === "countdown") send(ws, countdownMsg(r));
        if (r.state === "question") send(ws, currentQuestionMsg(r));
        return;
      }

      const r = room;
      // A room the host ended (or that timed out) is gone, even if this connection still points at it.
      if (!r || rooms.get(r.code) !== r) {
        room = null;
        return send(ws, { t: "error", error: "NOT_IN_ROOM" });
      }
      r.lastActivity = Date.now();
      const isHost = r.hostId === user.id;

      if (msg.t === "start" && isHost && r.state === "lobby") return startCountdown(r);

      // Lobby only, host only. A new count or difficulty re-picks the questions.
      if (msg.t === "settings") {
        if (!isHost || r.state !== "lobby") return;
        const next: BattleSettings = { ...r.settings, ...msg.settings };
        if (next.count !== r.settings.count || next.difficulty !== r.settings.difficulty) {
          const qs = pickQuestions(r.pool, next.difficulty, next.count);
          if (!qs) return send(ws, { t: "error", error: "NOT_ENOUGH_QUESTIONS" });
          r.questions = qs;
        }
        r.settings = next;
        return broadcast(r, roomState(r));
      }

      // Host ends the battle for everyone. An aborted battle awards no XP.
      if (msg.t === "end" && isHost) {
        broadcast(r, { t: "closed", reason: "host" });
        closeRoom(r);
        room = null;
        return;
      }

      // A player walks out: they're removed from the room (and its ranking).
      if (msg.t === "leave") {
        room = null;
        r.hostSockets.delete(ws);
        const p = r.players.get(user.id);
        if (p && !isHost) {
          r.players.delete(user.id);
          broadcast(r, roomState(r));
          // The rest may all have answered already.
          if (r.state === "question" && r.players.size > 0 && answeredCount(r) >= r.players.size) reveal(r);
        } else p?.sockets.delete(ws);
        return;
      }

      if (msg.t === "next" && isHost) {
        if (r.state === "question") return reveal(r);
        if (r.state === "reveal") {
          if (r.index + 1 >= r.questions.length) return void end(r);
          r.index++;
          return startQuestion(r);
        }
        return;
      }

      if (msg.t === "kick" && isHost && msg.playerId !== user.id) {
        const p = r.players.get(msg.playerId);
        if (p) {
          for (const s of p.sockets) send(s, { t: "kicked" });
          r.players.delete(msg.playerId);
          broadcast(r, roomState(r));
        }
        return;
      }

      if (msg.t === "answer" && r.state === "question" && msg.index === r.index) {
        const p = r.players.get(user.id);
        if (!p || p.answers.has(r.index)) return;
        const q = r.questions[r.index]!;
        const correct = checkAnswer(q.data, msg.answer);
        const elapsed = Date.now() - r.startedAt;
        const totalMs = questionMs(r);
        if (elapsed > totalMs + 500) return;
        p.streak = correct ? p.streak + 1 : 0;
        const scoring = { correct, msLeft: totalMs - elapsed, totalMs, streak: p.streak, isLast: r.index + 1 >= r.questions.length };
        const points = scoreAnswer({ ...scoring, settings: r.settings });
        p.score += points;
        p.baseScore += scoreAnswer({ ...scoring, settings: DEFAULT_BATTLE_SETTINGS });
        p.answers.set(r.index, { answer: msg.answer, at: elapsed, correct, points });
        send(ws, { t: "answered", index: r.index });
        const answered = answeredCount(r);
        broadcast(r, { t: "progress", answered, total: r.players.size });
        if (answered >= r.players.size) reveal(r);
      }
    },

    onClose(ws: WSContext) {
      const r = room;
      if (!r) return;
      r.hostSockets.delete(ws);
      const p = r.players.get(user.id);
      p?.sockets.delete(ws);
      // In the lobby, leaving removes you; during a game your score stays.
      if (p && p.sockets.size === 0 && (r.state === "lobby" || r.state === "countdown") && user.id !== r.hostId) {
        r.players.delete(user.id);
        broadcast(r, roomState(r));
      }
    },
  };
}
