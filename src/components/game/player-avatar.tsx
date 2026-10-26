import { cn } from "@/lib/utils";

// White initials like the activity-tile icons; gold is too light for white.
const TONES = [
  "bg-info text-white",
  "bg-warning text-white",
  "bg-danger text-white",
  "bg-success text-white",
  "bg-primary text-primary-foreground",
  "bg-gold text-gold-foreground",
] as const;

/** Stable colour per name, so a player keeps the same avatar everywhere. */
function toneFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return TONES[h % TONES.length]!;
}

/** First letter, or first + last initial when `two` and the name has several words. */
export function initials(name: string, two = false) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = [...(words[0] ?? "?")][0]!;
  const last = two && words.length > 1 ? [...words[words.length - 1]!][0]! : "";
  return (first + last).toUpperCase();
}

/** Round initials avatar in a Speelveld colour. Size via className (e.g. `size-12 text-lg`). */
export function PlayerAvatar({
  name,
  two,
  me,
  className,
}: {
  name: string;
  two?: boolean;
  /** Rings the avatar in primary (your own avatar on the podium). */
  me?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full font-heading text-sm font-semibold select-none",
        toneFor(name),
        me && "ring-3 ring-primary ring-offset-2 ring-offset-background",
        className,
      )}
    >
      {initials(name, two)}
    </span>
  );
}
