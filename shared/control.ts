/**
 * Characters no free text may contain: C0/C1 controls (newline, carriage return and tab are
 * allowed), zero-width characters, bidi overrides and the BOM. The server refuses them
 * (server/lib/input.ts); a form that takes pasted text strips them first.
 */
export const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤﻿]/;
const CONTROL_ALL = new RegExp(CONTROL.source, "g");

/** `s` without the characters the server refuses (keeps newlines and tabs). */
export const stripControl = (s: string): string => s.replace(CONTROL_ALL, "");
