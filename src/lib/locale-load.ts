// "Latest request wins": begin() returns a check that is true only until the next begin().
export function makeLatestOnly(): () => () => boolean {
  let n = 0;
  return () => {
    const mine = ++n;
    return () => mine === n;
  };
}

// Loads the English strings on demand. Pure (no i18next) so it can be tested alone.
export function makeLocaleLoader(
  add: (lng: "en", bundle: object) => void,
  importEn: () => Promise<{ default: object }>,
): (lng: "nl" | "en") => Promise<void> {
  let pending: Promise<void> | null = null;
  return (lng) => {
    if (lng === "nl") return Promise.resolve();
    if (!pending) {
      pending = importEn().then(
        (m) => add("en", m.default),
        (e) => {
          pending = null;
          throw e;
        },
      );
    }
    return pending;
  };
}
