/**
 * Help button rule inside AppLayout: hidden on a lesson with any ?view=.
 * Its own tiny module so the main chunk doesn't pull in shared/feedback.ts (the issue-draft code).
 */
export function showHelpButton(pathname: string, search: string): boolean {
  if (/^\/lesson\/[^/]+\/?$/i.test(pathname) && new URLSearchParams(search).has("view")) return false;
  return true;
}
