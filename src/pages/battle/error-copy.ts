import type { i18n as I18n } from "i18next";

export interface BattleErrorCopy {
  title: string;
  description?: string;
  /** The raw server code, shown small when there's no copy for it. */
  detail?: string;
}

/** Notice copy for a battle error code; unknown codes get the generic copy plus the code. */
export function battleErrorCopy(i18n: Pick<I18n, "exists" | "t">, code: string): BattleErrorCopy {
  const key = `battle.errors.${code}`;
  const copy: unknown = i18n.exists(key) ? i18n.t(key, { returnObjects: true }) : null;
  if (copy && typeof copy === "object" && typeof (copy as BattleErrorCopy).title === "string") return copy as BattleErrorCopy;
  const generic = i18n.t("battle.errors.GENERIC", { returnObjects: true }) as unknown as BattleErrorCopy;
  return { ...generic, detail: code };
}
