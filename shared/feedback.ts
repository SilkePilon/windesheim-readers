/**
 * Feedback and issue reports: types, the GitHub issue draft and the help-button rule.
 * Pure and shared by server, client and tests: no DOM, Node-only or i18n imports.
 */
import { LIMITS } from "./limits";

export const FEEDBACK_TYPES = ["feedback", "bug", "idea"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_STATUSES = ["new", "in_progress", "done"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export interface FeedbackContext {
  path: string;
  readerTitle?: string;
  lessonCode?: string;
  lessonTitle?: string;
  appVersion: string;
  userAgent: string;
  browser: string;
  viewport: string;
  locale: string;
  theme: string;
  standalone: boolean;
  error?: { message: string; status?: number; code?: string; apiPath?: string; stack?: string };
}

export interface IssueDraft {
  title: string;
  body: string;
  labels: string[];
}

const EMAIL = /[^\s@<>()[\]",;:]+@[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)*/gu;

/** Email-like strings become "[email]". */
export function redactEmails(s: string): string {
  return s.replace(EMAIL, "[email]");
}

/** Short browser + OS label for the admin, e.g. "Safari 18 · iOS". */
export function shortBrowser(userAgent: string): string {
  const ua = userAgent ?? "";
  if (!ua.trim()) return "Onbekend";
  const ver = (re: RegExp) => ua.match(re)?.[1];
  let browser: string | null = null;
  let m: string | undefined;
  if ((m = ver(/\bEdg(?:e|A|iOS)?\/(\d+)/))) browser = `Edge ${m}`;
  else if ((m = ver(/\bFxiOS\/(\d+)/) ?? ver(/\bFirefox\/(\d+)/))) browser = `Firefox ${m}`;
  else if ((m = ver(/\bCriOS\/(\d+)/) ?? ver(/\bChrome\/(\d+)/))) browser = `Chrome ${m}`;
  else if (/\bSafari\//.test(ua)) browser = `Safari${(m = ver(/\bVersion\/(\d+)/)) ? ` ${m}` : ""}`;

  let os: string | null = null;
  if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/.test(ua)) os = "macOS";
  else if (/CrOS/.test(ua)) os = "ChromeOS";
  else if (/Linux|X11/.test(ua)) os = "Linux";

  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Onbekend";
}

const LABELS: Record<FeedbackType, string> = { bug: "bug", idea: "enhancement", feedback: "feedback" };
const TITLE_MAX = 120;

/** A table cell: one line, no pipes, no email addresses. */
const cell = (v: string | number | boolean | undefined) =>
  redactEmails(String(v ?? "")).replace(/\|/g, "\\|").replace(/\s*[\r\n]+\s*/g, " ").trim();

export function defaultIssueDraft(r: {
  type: FeedbackType;
  message: string;
  context: FeedbackContext;
}): IssueDraft {
  const message = redactEmails(r.message.trim());
  const firstLine = (message.split(/[\r\n\u2028\u2029]/)[0] ?? "").trim();
  const prefix = `[${r.type}] `;
  const title = prefix + [...firstLine].slice(0, TITLE_MAX - prefix.length).join("").trimEnd();

  const c = r.context;
  const rows: [string, string | number | boolean | undefined][] = [
    ["path", c.path],
    ["readerTitle", c.readerTitle],
    ["lessonCode", c.lessonCode],
    ["lessonTitle", c.lessonTitle],
    ["appVersion", c.appVersion],
    ["browser", c.browser],
    ["viewport", c.viewport],
    ["locale", c.locale],
    ["theme", c.theme],
    ["standalone", c.standalone],
  ];
  if (c.error) {
    rows.push(
      ["error.message", c.error.message],
      ["error.status", c.error.status],
      ["error.code", c.error.code],
      ["error.apiPath", c.error.apiPath],
    );
  }
  const table = [
    "| Veld | Waarde |",
    "| --- | --- |",
    ...rows.filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `| ${k} | ${cell(v)} |`),
  ].join("\n");

  const body = `${message}\n\n${table}\n\n_Gemeld via de app_`;
  return { title, body, labels: [LABELS[r.type]] };
}

const MARKER = "\n\n_(ingekort)_";
const URL_MAX = 8000;

function build(repo: string, d: IssueDraft, body: string): string {
  const q = new URLSearchParams({ title: d.title, body, labels: d.labels.join(",") });
  return `https://github.com/${repo}/issues/new?${q.toString()}`;
}

export interface IssueUrl {
  url: string;
  /** True when the body had to be cut (and marked) to keep the URL under 8000 characters. */
  truncated: boolean;
  /** Body characters (code points) kept, out of `bodyChars`. */
  keptChars: number;
  bodyChars: number;
}

/** The "new issue" URL plus how much of the body survived (for the admin's live hint). */
export function issueUrl(repo: string, issue: IssueDraft): IssueUrl {
  const d = { ...issue, title: [...issue.title].slice(0, TITLE_MAX).join("") };
  const chars = [...d.body];
  const full = build(repo, d, d.body);
  if (full.length < URL_MAX) return { url: full, truncated: false, keptChars: chars.length, bodyChars: chars.length };
  const fits = (n: number) => build(repo, d, chars.slice(0, n).join("").trimEnd() + MARKER).length < URL_MAX;
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return { url: build(repo, d, chars.slice(0, lo).join("").trimEnd() + MARKER), truncated: true, keptChars: lo, bodyChars: chars.length };
}

/** The "new issue" URL, always under 8000 characters (the body is cut and marked when needed). */
export function githubIssueUrl(repo: string, issue: IssueDraft): string {
  return issueUrl(repo, issue).url;
}

/** A link to the issue: https://github.com/ plus printable ASCII only (no spaces or control characters). */
export const GITHUB_URL = /^https:\/\/github\.com\/[!-~]*$/;
/** The client-side twin of the server's githubUrl rule. */
export function isGithubUrl(s: string): boolean {
  return s.length <= LIMITS.feedback.githubUrl && GITHUB_URL.test(s);
}

/** Help button rule inside AppLayout: hidden on a lesson with any ?view=. */
export function showHelpButton(pathname: string, search: string): boolean {
  if (/^\/lesson\/[^/]+\/?$/i.test(pathname) && new URLSearchParams(search).has("view")) return false;
  return true;
}
