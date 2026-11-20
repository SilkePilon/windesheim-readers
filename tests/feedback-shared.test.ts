import { describe, expect, test } from "bun:test";
import {
  defaultIssueDraft,
  githubIssueUrl,
  redactEmails,
  shortBrowser,
  showHelpButton,
  type FeedbackContext,
} from "../shared/feedback";
import { LIMITS } from "../shared/limits";

const context: FeedbackContext = {
  path: "/lesson/abc",
  readerTitle: "Reader",
  lessonCode: "L1",
  lessonTitle: "Les",
  appVersion: "abc123",
  userAgent: "UA",
  browser: "Safari 18 · iOS",
  viewport: "390x844",
  locale: "nl",
  theme: "dark",
  standalone: false,
};

describe("redactEmails", () => {
  test("replaces emails", () => {
    expect(redactEmails("mail a.b@student.windesheim.nl nu")).toBe("mail [email] nu");
  });
});

describe("shortBrowser", () => {
  test("iPhone Safari", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
    const b = shortBrowser(ua);
    expect(b).toContain("Safari");
    expect(b).toContain("iOS");
  });
  test("Chrome Windows", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    const b = shortBrowser(ua);
    expect(b).toContain("Chrome");
    expect(b).toContain("Windows");
  });
  test("empty", () => expect(shortBrowser("")).toBe("Onbekend"));
});

describe("defaultIssueDraft", () => {
  const draft = (type: "bug" | "idea" | "feedback", message = "Knop werkt niet\nmeer tekst") =>
    defaultIssueDraft({ type, message, context });
  test("title and labels", () => {
    expect(draft("bug").title).toBe("[bug] Knop werkt niet");
    expect(draft("bug").labels).toEqual(["bug"]);
    expect(draft("idea").labels).toEqual(["enhancement"]);
    expect(draft("feedback").labels).toEqual(["feedback"]);
  });
  test("title capped at 120", () => {
    expect(draft("bug", "x".repeat(500)).title.length).toBeLessThanOrEqual(120);
  });
  test("body", () => {
    const b = draft("bug").body;
    expect(b).toContain("Knop werkt niet\nmeer tekst");
    expect(b).toContain("| path |");
    expect(b).toContain("| appVersion |");
    expect(b).toContain("Gemeld via de app");
  });
  test("no @ with email in message or context", () => {
    const d = defaultIssueDraft({
      type: "bug",
      message: "Mail me@x.nl graag",
      context: { ...context, error: { message: "fail for a@b.com" } },
    });
    expect(d.body).not.toContain("@");
    expect(d.title).not.toContain("@");
  });
});

describe("githubIssueUrl", () => {
  test("round trips", () => {
    const d = defaultIssueDraft({ type: "bug", message: "Knop werkt niet & meer", context });
    const url = githubIssueUrl("o/r", d);
    expect(url.startsWith("https://github.com/o/r/issues/new?")).toBe(true);
    const u = new URL(url);
    expect(u.searchParams.get("title")).toBe(d.title);
    expect(u.searchParams.get("body")).toBe(d.body);
    expect(u.searchParams.get("labels")).toBe("bug");
  });
  test("truncates long bodies", () => {
    const url = githubIssueUrl("o/r", { title: "t", body: "é€ ".repeat(7000).slice(0, 20000), labels: ["bug", "feedback"] });
    expect(url.length).toBeLessThan(8000);
    const body = new URL(url).searchParams.get("body")!;
    expect(body.endsWith("\n\n_(ingekort)_")).toBe(true);
  });
});

describe("showHelpButton", () => {
  test("rules", () => {
    expect(showHelpButton("/", "")).toBe(true);
    expect(showHelpButton("/lesson/x", "")).toBe(true);
    expect(showHelpButton("/lesson/x", "?view=listen")).toBe(false);
    expect(showHelpButton("/lesson/x", "?view=read")).toBe(false);
    expect(showHelpButton("/profile", "")).toBe(true);
    expect(showHelpButton("/admin/feedback", "")).toBe(true);
  });
});

test("limits", () => {
  expect(LIMITS.feedback.message).toEqual({ min: 10, max: 4000 });
  expect(LIMITS.feedback.githubUrl).toBe(300);
});

describe("fix round 1", () => {
  test("redact: dotless domain, apostrophe, several, full stop", () => {
    expect(redactEmails("me@localhost")).toBe("[email]");
    expect(redactEmails("o'brien@x.nl")).toBe("[email]");
    expect(redactEmails("a@b.nl en c@d.com")).toBe("[email] en [email]");
    expect(redactEmails("Mail me@x.nl.")).toBe("Mail [email].");
  });
  test("long title is clamped", () => {
    const url = githubIssueUrl("o/r", { title: "t".repeat(5000), body: "b", labels: ["bug"] });
    expect(url.length).toBeLessThan(8000);
    expect([...new URL(url).searchParams.get("title")!].length).toBe(120);
  });
  test("emoji body truncates cleanly", () => {
    const body = "😀x".repeat(6000);
    const url = githubIssueUrl("o/r", { title: "t", body, labels: ["bug"] });
    expect(url.length).toBeLessThan(8000);
    const out = new URL(url).searchParams.get("body")!;
    expect(out).not.toContain("�");
    expect(out.endsWith("_(ingekort)_")).toBe(true);
    expect(out.startsWith("😀x😀x")).toBe(true);
  });
  test("title first line splits on unicode separators", () => {
    const d = defaultIssueDraft({ type: "bug", message: "eerste tweede", context });
    expect(d.title).toBe("[bug] eerste");
  });
  test("help button path variants", () => {
    expect(showHelpButton("/lesson/x/", "?view=read")).toBe(false);
    expect(showHelpButton("/lessons", "")).toBe(true);
    expect(showHelpButton("/Lesson/x", "?view=read")).toBe(false);
  });
});
