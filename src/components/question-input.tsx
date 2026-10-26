import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PublicQuestion } from "@/lib/types";
import { cn } from "@/lib/utils";

// Battle (`big`) keeps Kahoot-style colours for the picked option.
const BIG_COLORS = [
  "data-[sel=true]:border-danger data-[sel=true]:[--shade:var(--danger-shade)]",
  "data-[sel=true]:border-info data-[sel=true]:[--shade:var(--info-shade)]",
  "data-[sel=true]:border-gold data-[sel=true]:[--shade:var(--gold-shade)]",
  "data-[sel=true]:border-success data-[sel=true]:[--shade:var(--success-shade)]",
];

export interface Reveal {
  correct: boolean;
  correctAnswer: unknown;
}

type OptionState = "correct" | "wrong" | null;

/** A chunky-surface answer block. Text always wraps; it is never truncated. */
function OptionButton({
  marker,
  children,
  selected,
  state,
  disabled,
  onClick,
  colorClass,
  big,
}: {
  marker?: ReactNode;
  children: ReactNode;
  selected: boolean;
  state?: OptionState;
  disabled?: boolean;
  onClick: () => void;
  colorClass?: string;
  big?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="chunky-surface"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      data-sel={selected && !state}
      data-state={state ?? undefined}
      className={cn(
        "h-auto w-full justify-start gap-3 rounded-[16px] border-2 border-transparent px-4 text-left font-sans text-[15px] leading-snug font-bold whitespace-normal [--press:4px] md:text-base",
        // Locked after checking: keep full colour and the chunky shadow.
        "disabled:opacity-100 disabled:shadow-[0_4px_0_var(--shade)]",
        big ? "min-h-16 py-4" : "min-h-14 py-3",
        selected && !state && "border-primary [--shade:var(--primary-shade)]",
        colorClass,
        state === "correct" &&
          "border-success bg-[color-mix(in_oklab,var(--success)_14%,var(--card))] [--shade:var(--success-shade)] dark:bg-[color-mix(in_oklab,var(--success)_24%,var(--card))]",
        state === "wrong" &&
          "animate-shake border-danger bg-[color-mix(in_oklab,var(--danger)_14%,var(--card))] [--shade:var(--danger-shade)] motion-reduce:animate-none dark:bg-[color-mix(in_oklab,var(--danger)_22%,var(--card))]",
      )}
    >
      {(marker || state) && (
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-[9px] bg-accent font-heading text-sm font-semibold text-primary",
            state === "correct" && "bg-success text-success-foreground",
            state === "wrong" && "bg-danger text-danger-foreground",
          )}
        >
          {state === "correct" ? <Check strokeWidth={3} /> : state === "wrong" ? <X strokeWidth={3} /> : marker}
        </span>
      )}
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </Button>
  );
}

/** Controlled input for all auto-graded question types. */
export function QuestionInput({
  question,
  value,
  onChange,
  reveal,
  disabled,
  onSubmit,
  big,
}: {
  question: PublicQuestion;
  value: unknown;
  onChange: (v: unknown) => void;
  reveal?: Reveal | null;
  disabled?: boolean;
  onSubmit?: () => void;
  big?: boolean;
}) {
  const { t } = useTranslation();
  const locked = disabled || !!reveal;

  if (question.type === "mc") {
    return (
      <div className="grid gap-3">
        {question.options.map((opt, i) => {
          const isCorrect = reveal && reveal.correctAnswer === i;
          const isWrongPick = reveal && value === i && !reveal.correct;
          return (
            <OptionButton
              key={i}
              selected={value === i}
              state={isCorrect ? "correct" : isWrongPick ? "wrong" : null}
              disabled={locked}
              onClick={() => onChange(i)}
              colorClass={big ? BIG_COLORS[i] : undefined}
              big={big}
            >
              {opt}
            </OptionButton>
          );
        })}
      </div>
    );
  }

  if (question.type === "tf") {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[true, false].map((v) => {
          const isCorrect = reveal && reveal.correctAnswer === v;
          const isWrongPick = reveal && value === v && !reveal.correct;
          return (
            <OptionButton
              key={String(v)}
              marker={v ? <Check strokeWidth={3} /> : <X strokeWidth={3} />}
              selected={value === v}
              state={isCorrect ? "correct" : isWrongPick ? "wrong" : null}
              disabled={locked}
              onClick={() => onChange(v)}
              big
            >
              {v ? t("quiz.true") : t("quiz.false")}
            </OptionButton>
          );
        })}
      </div>
    );
  }

  if (question.type === "fill") {
    return (
      <div className="space-y-2">
        <Input
          autoFocus
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit?.();
            }
          }}
          disabled={locked}
          placeholder={t("quiz.fillPlaceholder")}
          autoCapitalize="off"
          autoCorrect="off"
          className={cn(
            "h-14 rounded-[16px] border-2 border-transparent bg-card px-4 text-base font-bold shadow-[0_4px_0_var(--chunky)] focus-visible:border-primary md:text-base dark:bg-card",
            "disabled:cursor-default disabled:opacity-100 dark:disabled:bg-card",
            reveal?.correct && "border-success shadow-[0_4px_0_var(--success-shade)]",
            reveal && !reveal.correct && "border-danger shadow-[0_4px_0_var(--danger-shade)]",
          )}
        />
        {/* The quiz shows this in its feedback sheet; battle has no sheet. */}
        {big && reveal && !reveal.correct && (
          <p className="text-sm text-muted-foreground">{t("quiz.correctAnswerWas", { answer: String(reveal.correctAnswer) })}</p>
        )}
      </div>
    );
  }

  if (question.type === "order") {
    const picked = (value as string[] | undefined) ?? [];
    const remaining = question.items.filter((i) => !picked.includes(i));
    const correctOrder = reveal?.correctAnswer as string[] | undefined;
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("quiz.orderHint")}</p>
        {picked.length > 0 && (
          <ol className="space-y-3">
            {picked.map((item, i) => (
              <li key={item}>
                <OptionButton
                  marker={i + 1}
                  selected={!correctOrder}
                  state={correctOrder ? (correctOrder[i] === item ? "correct" : "wrong") : null}
                  disabled={locked}
                  onClick={() => onChange(picked.filter((p) => p !== item))}
                >
                  {item}
                </OptionButton>
              </li>
            ))}
          </ol>
        )}
        {remaining.length > 0 && (
          <div className="space-y-3 rounded-[20px] border-2 border-dashed border-input p-2.5 pb-3.5">
            {remaining.map((item) => (
              <OptionButton key={item} selected={false} disabled={locked} onClick={() => onChange([...picked, item])}>
                {item}
              </OptionButton>
            ))}
          </div>
        )}
        {correctOrder && !reveal?.correct && (
          <ol className="list-decimal space-y-1 rounded-[16px] bg-card py-3 pr-3 pl-8 text-sm font-bold shadow-[0_4px_0_var(--chunky)] marker:font-heading marker:text-success-shade dark:marker:text-success">
            {correctOrder.map((s) => (
              <li key={s} className="break-words">
                {s}
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  return null;
}

export function isAnswered(q: PublicQuestion, v: unknown) {
  if (q.type === "mc") return typeof v === "number";
  if (q.type === "tf") return typeof v === "boolean";
  if (q.type === "fill") return typeof v === "string" && v.trim().length > 0;
  if (q.type === "order") return Array.isArray(v) && v.length === q.items.length;
  return false;
}

/** The correct answer as display text, for the feedback sheet (null for order questions). */
export function correctAnswerText(q: PublicQuestion, correctAnswer: unknown, t: (k: string) => string): string | null {
  if (q.type === "mc" && typeof correctAnswer === "number") return q.options[correctAnswer] ?? null;
  if (q.type === "tf" && typeof correctAnswer === "boolean") return correctAnswer ? t("quiz.true") : t("quiz.false");
  if (q.type === "fill") return String(correctAnswer);
  return null;
}
