/** Adds `scrolling` to a target while scrolling and for `idleMs` after the last scroll event. */
export function createScrollPause(
  target: { classList: DOMTokenList },
  schedule: (fn: () => void, ms: number) => unknown,
  cancel: (id: unknown) => void,
  idleMs = 150,
): { onScroll(): void; dispose(): void } {
  let timer: unknown;
  let pending = false;
  const stop = () => {
    if (pending) cancel(timer);
    pending = false;
  };
  return {
    onScroll() {
      if (!target.classList.contains("scrolling")) target.classList.add("scrolling");
      stop();
      pending = true;
      timer = schedule(() => {
        pending = false;
        target.classList.remove("scrolling");
      }, idleMs);
    },
    dispose() {
      stop();
      target.classList.remove("scrolling");
    },
  };
}
