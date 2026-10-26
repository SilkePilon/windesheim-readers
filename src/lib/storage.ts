/** localStorage that never throws (blocked storage, some private modes): reads give null, writes are skipped. */
export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not persisted; the app works without it.
  }
}
