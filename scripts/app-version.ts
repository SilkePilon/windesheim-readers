import { execSync } from "node:child_process";

/** Build version: env APP_VERSION (e.g. the CI commit SHA), else the git short SHA, else "dev". */
export function appVersion(
  env: Record<string, string | undefined> = process.env,
  git: () => string = () => execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(),
): string {
  const fromEnv = env.APP_VERSION?.trim();
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    return git().trim().slice(0, 7) || "dev";
  } catch {
    return "dev";
  }
}
