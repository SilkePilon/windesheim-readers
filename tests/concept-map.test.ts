// Concept map: pure validation and visibility, generation (stub and injected output), admin and student endpoints.
import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { websocket } from "@hono/bun";
import { eq, inArray } from "drizzle-orm";
import { db, runMigrations, schema } from "../server/db";
import { env } from "../server/env";
import { resetEmailGate } from "../server/lib/email-gate";
import { CONCEPT_LIMITS, validateConceptMap, visibleMap, type ConceptMapData } from "../shared/concept-map";

runMigrations();
const { app } = await import("../server/app");
const { generateConceptMap } = await import("../server/ai/concept-map");
const { recoverInterruptedJobs } = await import("../server/ai/pipeline");

// ---------- pure ----------

const c = (id: string, lessonId = "L1", label = id) => ({ id, label, description: "", lessonId });
const lessons = new Set(["L1", "L2"]);

describe("validateConceptMap", () => {
  test("a valid map passes", () => {
    expect(validateConceptMap({ concepts: [c("a"), c("b", "L2")], links: [{ from: "a", to: "b", label: "causes" }] }, lessons)).toEqual({ ok: true });
  });
  test("each error code", () => {
    const err = (d: ConceptMapData) => {
      const r = validateConceptMap(d, lessons);
      return r.ok ? null : r.error;
    };
    const many = Array.from({ length: CONCEPT_LIMITS.concepts + 1 }, (_, i) => c(`c${i}`));
    expect(err({ concepts: many, links: [] })).toBe("TOO_MANY");
    const links = Array.from({ length: CONCEPT_LIMITS.links + 1 }, () => ({ from: "a", to: "b", label: "" }));
    expect(err({ concepts: [c("a"), c("b")], links })).toBe("TOO_MANY");
    expect(err({ concepts: [c("a"), c("a")], links: [] })).toBe("DUPLICATE_ID");
    expect(err({ concepts: [c("a", "L9")], links: [] })).toBe("UNKNOWN_LESSON");
    expect(err({ concepts: [c("a")], links: [{ from: "a", to: "zz", label: "" }] })).toBe("UNKNOWN_CONCEPT");
    expect(err({ concepts: [c("a")], links: [{ from: "a", to: "a", label: "" }] })).toBe("SELF_LINK");
  });
  test("first failure wins, in the fixed order", () => {
    const r = validateConceptMap({ concepts: [c("a", "L9"), c("a")], links: [{ from: "x", to: "x", label: "" }] }, lessons);
    expect(r).toEqual({ ok: false, error: "DUPLICATE_ID" });
  });
});

describe("visibleMap", () => {
  test("drops concepts of hidden lessons and their links", () => {
    const d: ConceptMapData = {
      concepts: [c("a"), c("b", "L2"), c("x", "L3")],
      links: [
        { from: "a", to: "b", label: "1" },
        { from: "a", to: "x", label: "2" },
        { from: "x", to: "b", label: "3" },
      ],
    };
    expect(visibleMap(d, new Set(["L1", "L2"]))).toEqual({ concepts: [c("a"), c("b", "L2")], links: [{ from: "a", to: "b", label: "1" }] });
  });
});

// ---------- app ----------

let server: ReturnType<typeof Bun.serve>;
let base = "";
const saved = { header: env.clientIpHeader, disabled: env.rateLimitDisabled, stub: process.env.AI_STUB };
const magic = new Map<string, string>();
const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
  const m = /\[magic-link\] (\S+)\n\s+(\S+)/.exec(String(args[0]));
  if (m) magic.set(m[1]!, m[2]!);
});
const errSpy = spyOn(console, "error").mockImplementation(() => {});

const R = "cm-reader";
const R_HIDDEN = "cm-hidden";
const R_OTHER = "cm-other";
let student = "";
let adminCookie = "";
let n = 0;

async function login(email: string) {
  const ip = `198.44.1.${++n}`;
  const r = await fetch(`${base}/api/auth/sign-in/magic-link`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:5173", "x-test-ip": ip },
    body: JSON.stringify({ email, callbackURL: "/" }),
  });
  expect(r.status).toBe(200);
  const url = new URL(magic.get(email)!);
  const v = await fetch(`${base}${url.pathname}${url.search}`, { redirect: "manual", headers: { "x-test-ip": ip } });
  return v.headers.getSetCookie().map((x) => x.split(";")[0]).join("; ");
}

const lesson = (id: string, readerId: string, code: string, week: number, position: number, status: "ready" | "pending" = "ready") => ({
  id,
  readerId,
  code,
  title: `Les ${code}`,
  week,
  position,
  startPage: 1,
  endPage: 2,
  status,
  summary: `Samenvatting ${code}`,
  keyPoints: [`Punt ${code}`],
});

beforeAll(async () => {
  process.env.AI_STUB = "1";
  server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch, websocket });
  base = `http://127.0.0.1:${server.port}`;
  env.clientIpHeader = "x-test-ip";
  env.rateLimitDisabled = true;
  student = await login("cm-student@student.windesheim.nl");
  adminCookie = await login("cm-admin@windesheim.nl");
  db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.email, "cm-admin@windesheim.nl")).run();
  db.insert(schema.reader)
    .values([
      { id: R, title: "Reader", fileName: "a.pdf", status: "ready", published: false },
      { id: R_HIDDEN, title: "Hidden", fileName: "b.pdf", status: "ready", published: false },
      { id: R_OTHER, title: "Other", fileName: "c.pdf", status: "ready", published: true },
    ])
    .run();
  db.insert(schema.lesson)
    .values([
      lesson("cm-L1", R, "1.1", 1, 0),
      lesson("cm-L2", R, "1.2", 1, 1),
      lesson("cm-L3", R, "2.1", 2, 2),
      lesson("cm-L4", R, "2.2", 2, 3, "pending"),
      lesson("cm-O1", R_OTHER, "1.1", 1, 0),
    ])
    .run();
});
afterAll(() => {
  db.delete(schema.reader).where(inArray(schema.reader.id, [R, R_HIDDEN, R_OTHER])).run();
  server.stop(true);
  logSpy.mockRestore();
  errSpy.mockRestore();
  resetEmailGate();
  Object.assign(env, { clientIpHeader: saved.header, rateLimitDisabled: saved.disabled });
  if (saved.stub === undefined) delete process.env.AI_STUB;
  else process.env.AI_STUB = saved.stub;
});

const req = (method: string, path: string, cookie: string, body?: unknown) =>
  fetch(`${base}/api${path}`, {
    method,
    headers: { cookie, "content-type": "application/json", origin: "http://localhost:5173" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const row = () => db.select().from(schema.conceptMap).where(eq(schema.conceptMap.readerId, R)).get();

describe("generateConceptMap", () => {
  test("stub: ready, 2 concepts per ready lesson, chain links that all resolve", async () => {
    await generateConceptMap(R);
    const r = row()!;
    expect(r.status).toBe("ready");
    expect(r.editedAt).toBeNull();
    const d = r.data!;
    expect(d.concepts.length).toBe(6);
    for (const id of ["cm-L1", "cm-L2", "cm-L3"]) expect(d.concepts.filter((x) => x.lessonId === id).length).toBe(2);
    expect(d.concepts.some((x) => x.lessonId === "cm-L4")).toBe(false);
    expect(d.links.length).toBe(5);
    const ids = new Set(d.concepts.map((x) => x.id));
    for (const l of d.links) expect(ids.has(l.from) && ids.has(l.to)).toBe(true);
    expect(validateConceptMap(d, new Set(["cm-L1", "cm-L2", "cm-L3"]))).toEqual({ ok: true });
  });

  test("model output: labels matched case-insensitively and trimmed, duplicates merged, unresolved dropped, limits applied", async () => {
    await generateConceptMap(R, {
      generate: async () => ({
        concepts: [
          { label: " Vraag ", description: "d1", lessonCode: "1.1" },
          { label: "vraag", description: "dup", lessonCode: "1.1" },
          { label: "Aanbod", description: "d2", lessonCode: " 1.2 " },
          { label: "Ghost", description: "x", lessonCode: "9.9" },
          { label: "Niet klaar", description: "x", lessonCode: "2.2" },
          { label: "   ", description: "x", lessonCode: "1.1" },
          { label: "Prijs", description: "p".repeat(500), lessonCode: "2.1" },
        ],
        links: [
          { fromLabel: "VRAAG", toLabel: " aanbod", label: "beïnvloedt" },
          { fromLabel: "vraag", toLabel: "Aanbod", label: "dubbel" },
          { fromLabel: "Prijs", toLabel: "prijs", label: "zelf" },
          { fromLabel: "Ghost", toLabel: "Prijs", label: "weg" },
          { fromLabel: "Aanbod", toLabel: "Prijs", label: "r".repeat(100) },
        ],
      }),
    });
    const d = row()!.data!;
    expect(d.concepts.map((x) => [x.label, x.lessonId])).toEqual([
      ["Vraag", "cm-L1"],
      ["Aanbod", "cm-L2"],
      ["Prijs", "cm-L3"],
    ]);
    expect(d.concepts[0]!.description).toBe("d1");
    expect(d.concepts[2]!.description.length).toBe(CONCEPT_LIMITS.description);
    const byId = new Map(d.concepts.map((x) => [x.id, x.label]));
    expect(d.links.map((l) => [byId.get(l.from), byId.get(l.to), l.label.length])).toEqual([
      ["Vraag", "Aanbod", "beïnvloedt".length],
      ["Aanbod", "Prijs", CONCEPT_LIMITS.relation],
    ]);
  });

  test("too many concepts: capped at the limit, spread over the lessons", async () => {
    await generateConceptMap(R, {
      generate: async () => ({
        concepts: ["1.1", "1.2", "2.1"].flatMap((code) => Array.from({ length: 40 }, (_, i) => ({ label: `${code}-${i}`, description: "", lessonCode: code }))),
        links: [],
      }),
    });
    const d = row()!.data!;
    expect(d.concepts.length).toBe(CONCEPT_LIMITS.concepts);
    for (const id of ["cm-L1", "cm-L2", "cm-L3"]) expect(d.concepts.filter((x) => x.lessonId === id).length).toBe(20);
  });

  test("a failing model call stores the error", async () => {
    await generateConceptMap(R, {
      generate: async () => {
        throw new Error("boom");
      },
    });
    expect(row()).toMatchObject({ status: "error", error: "boom" });
  });

  test("boot recovery: a map stuck in generating or pending becomes an error, its data kept", async () => {
    for (const status of ["generating", "pending"] as const) {
      db.update(schema.conceptMap).set({ status, error: null }).where(eq(schema.conceptMap.readerId, R)).run();
      const data = row()!.data;
      await recoverInterruptedJobs();
      expect(row()).toMatchObject({ status: "error", error: "Interrupted by server restart", data });
    }
  });
});

describe("admin endpoints", () => {
  test("a student can't generate, read or edit (403)", async () => {
    expect((await req("POST", `/admin/readers/${R}/concept-map`, student)).status).toBe(403);
    expect((await req("GET", `/admin/readers/${R}/concept-map`, student)).status).toBe(403);
    expect((await req("PUT", `/admin/readers/${R}/concept-map`, student, { data: { concepts: [], links: [] } })).status).toBe(403);
  });

  test("unknown reader: 404; no map yet: null", async () => {
    expect((await req("POST", `/admin/readers/nope/concept-map`, adminCookie)).status).toBe(404);
    expect((await req("GET", `/admin/readers/nope/concept-map`, adminCookie)).status).toBe(404);
    const r = await req("GET", `/admin/readers/${R_HIDDEN}/concept-map`, adminCookie);
    expect(r.status).toBe(200);
    expect(await r.json()).toBeNull();
  });

  test("POST: 202, then the map becomes ready", async () => {
    const r = await req("POST", `/admin/readers/${R}/concept-map`, adminCookie);
    expect(r.status).toBe(202);
    for (let i = 0; i < 50 && row()?.status !== "ready"; i++) await Bun.sleep(10);
    const g = (await (await req("GET", `/admin/readers/${R}/concept-map`, adminCookie)).json()) as { status: string; data: ConceptMapData; editedAt: unknown };
    expect(g.status).toBe("ready");
    expect(g.data.concepts.length).toBe(6);
    expect(g.editedAt).toBeNull();
  });

  test("POST without ready lessons: 409", async () => {
    expect((await req("POST", `/admin/readers/${R_HIDDEN}/concept-map`, adminCookie)).status).toBe(409);
  });

  const edit: ConceptMapData = {
    concepts: [
      { id: "k1", label: "Vraag", description: "Wat mensen willen kopen.", lessonId: "cm-L1" },
      { id: "k2", label: "Aanbod", description: "Wat er te koop is.", lessonId: "cm-L2" },
      { id: "k4", label: "Concept van een niet-klare les", description: "", lessonId: "cm-L4" },
    ],
    links: [
      { from: "k1", to: "k2", label: "beïnvloedt" },
      { from: "k4", to: "k1", label: "verborgen" },
    ],
  };

  test("PUT: a valid edit is saved with editedAt", async () => {
    const r = await req("PUT", `/admin/readers/${R}/concept-map`, adminCookie, { data: edit });
    expect(r.status).toBe(200);
    const saved = row()!;
    expect(saved.status).toBe("ready");
    expect(saved.editedAt).toBeInstanceOf(Date);
    expect(saved.data).toEqual(edit);
    const g = (await (await req("GET", `/admin/readers/${R}/concept-map`, adminCookie)).json()) as { editedAt: number | null };
    expect(g.editedAt).not.toBeNull();
  });

  test("PUT: invalid edits are refused with a code", async () => {
    const put = async (data: unknown) => {
      const r = await req("PUT", `/admin/readers/${R}/concept-map`, adminCookie, { data });
      return [r.status, ((await r.json()) as { error: string }).error];
    };
    expect(await put({ ...edit, links: [{ from: "k1", to: "nope", label: "" }] })).toEqual([400, "UNKNOWN_CONCEPT"]);
    expect(await put({ concepts: [{ ...edit.concepts[0], lessonId: "cm-O1" }], links: [] })).toEqual([400, "UNKNOWN_LESSON"]);
    expect(await put({ concepts: [edit.concepts[0], edit.concepts[0]], links: [] })).toEqual([400, "DUPLICATE_ID"]);
    expect(await put({ ...edit, links: [{ from: "k1", to: "k1", label: "" }] })).toEqual([400, "SELF_LINK"]);
    const many = Array.from({ length: 61 }, (_, i) => ({ id: `m${i}`, label: `C${i}`, description: "", lessonId: "cm-L1" }));
    expect((await put({ concepts: many, links: [] }))[0]).toBe(400);
    expect((await put({ concepts: [{ ...edit.concepts[0], label: "x".repeat(81) }], links: [] }))[0]).toBe(400);
    expect(row()!.data).toEqual(edit);
  });

  test("PUT: a full-size map fits the body limit", async () => {
    const concepts = Array.from({ length: CONCEPT_LIMITS.concepts }, (_, i) => ({
      id: `big-${i}`.padEnd(40, "x"),
      label: "é".repeat(CONCEPT_LIMITS.label),
      description: "ë".repeat(CONCEPT_LIMITS.description),
      lessonId: "cm-L1",
    }));
    const links = Array.from({ length: CONCEPT_LIMITS.links }, (_, i) => ({ from: concepts[i % 60]!.id, to: concepts[(i + 1) % 60]!.id, label: "ü".repeat(CONCEPT_LIMITS.relation) }));
    expect((await req("PUT", `/admin/readers/${R}/concept-map`, adminCookie, { data: { concepts, links } })).status).toBe(200);
    expect((await req("PUT", `/admin/readers/${R}/concept-map`, adminCookie, { data: edit })).status).toBe(200);
  });
});

describe("student endpoint", () => {
  test("unpublished reader: 404", async () => {
    expect((await req("GET", `/readers/${R}/concept-map`, student)).status).toBe(404);
  });

  test("published: 200 with visible concepts and lessons with mastery", async () => {
    db.update(schema.reader).set({ published: true }).where(eq(schema.reader.id, R)).run();
    const r = await req("GET", `/readers/${R}/concept-map`, student);
    expect(r.status).toBe(200);
    const m = (await r.json()) as ConceptMapData & { lessons: { id: string; code: string; title: string; week: number; mastery: number }[] };
    expect(m.concepts.map((x) => x.id)).toEqual(["k1", "k2"]);
    expect(m.links).toEqual([{ from: "k1", to: "k2", label: "beïnvloedt" }]);
    expect(m.lessons.map((l) => l.id)).toEqual(["cm-L1", "cm-L2", "cm-L3"]);
    expect(m.lessons[0]).toEqual({ id: "cm-L1", code: "1.1", title: "Les 1.1", week: 1, mastery: 0 });
  });

  const flag = async (id: string) => ((await (await req("GET", `/readers/${id}/learn`, student)).json()) as { conceptMap: boolean }).conceptMap;

  test("no map: 404 and not flagged", async () => {
    expect((await req("GET", `/readers/${R_OTHER}/concept-map`, student)).status).toBe(404);
    expect(await flag(R_OTHER)).toBe(false);
  });

  test("a stored map stays served and flagged while regenerating and after a failed regeneration", async () => {
    expect(await flag(R)).toBe(true);
    for (const status of ["generating", "error", "pending"] as const) {
      db.update(schema.conceptMap).set({ status }).where(eq(schema.conceptMap.readerId, R)).run();
      const r = await req("GET", `/readers/${R}/concept-map`, student);
      expect(r.status).toBe(200);
      expect(((await r.json()) as ConceptMapData).concepts.map((x) => x.id)).toEqual(["k1", "k2"]);
      expect(await flag(R)).toBe(true);
    }
    db.update(schema.conceptMap).set({ status: "ready" }).where(eq(schema.conceptMap.readerId, R)).run();
  });

  test("a map whose concepts are all in lessons that aren't ready: 404 and not flagged", async () => {
    const before = row()!.data!;
    db.update(schema.conceptMap)
      .set({ data: { concepts: [c("p1", "cm-L4"), c("p2", "cm-L4")], links: [{ from: "p1", to: "p2", label: "x" }] } })
      .where(eq(schema.conceptMap.readerId, R))
      .run();
    try {
      expect((await req("GET", `/readers/${R}/concept-map`, student)).status).toBe(404);
      expect(await flag(R)).toBe(false);
    } finally {
      db.update(schema.conceptMap).set({ data: before }).where(eq(schema.conceptMap.readerId, R)).run();
    }
  });
});
