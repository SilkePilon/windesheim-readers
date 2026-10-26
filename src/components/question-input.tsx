import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { PublicQuestion } from "@/lib/types";
import { cn } from "@/lib/utils";

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const MC_COLORS = [
  "data-[sel=true]:border-rose-500 data-[sel=true]:bg-rose-500/10",
  "data-[sel=true]:border-sky-500 data-[sel=true]:bg-sky-500/10",
  "data-[sel=true]:border-amber-500 data-[sel=true]:bg-amber-500/10",
  "data-[sel=true]:border-emerald-500 data-[sel=true]:bg-emerald-500/10",
];

export interface Reveal {
  correct: boolean;
  correctAnswer: unknown;
}

function OptionButton({
  label,
  text,
  selected,
  state,
  disabled,
  onClick,
  colorClass,
  big,
}: {
  label?: string;
  text: string;
  selected: boolean;
  state?: "correct" | "wrong" | null;
  disabled?: boolean;
  onClick: () => void;
  colorClass?: string;
  big?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-sel={selected && !state}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border-2 bg-card px-4 text-left text-[15px] font-medium transition-all active:scale-[0.99] disabled:cursor-default",
        big ? "min-h-16 py-4" : "min-h-13 py-3",
        !disabled && "hover:border-primary/40",
        selected && !state && "border-primary bg-primary/5",
        colorClass,
        state === "correct" && "border-emerald-500 bg-emerald-500/10",
        state === "wrong" && "animate-shake border-red-500 bg-red-500/10",
      )}
    >
      {label && (
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold",
            state === "correct" && "bg-emerald-500 text-white",
            state === "wrong" && "bg-red-500 text-white",
          )}
        >
          {state === "correct" ? <Check className="size-4" /> : state === "wrong" ? <X className="size-4" /> : label}
        </span>
      )}
      <span className="flex-1">{text}</span>
    </button>
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
      <div className="grid gap-2.5">
        {question.options.map((opt, i) => {
          const isCorrect = reveal && reveal.correctAnswer === i;
          const isWrongPick = reveal && value === i && !reveal.correct;
          return (
            <OptionButton
              key={i}
              label={LETTERS[i]}
              text={opt}
              selected={value === i}
              state={isCorrect ? "correct" : isWrongPick ? "wrong" : null}
              disabled={locked}
              onClick={() => onChange(i)}
              colorClass={big ? MC_COLORS[i] : undefined}
              big={big}
            />
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
              text={v ? `✓ ${t("quiz.true")}` : `✗ ${t("quiz.false")}`}
              selected={value === v}
              state={isCorrect ? "correct" : isWrongPick ? "wrong" : null}
              disabled={locked}
              onClick={() => onChange(v)}
              big
            />
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
          onKeyDown={(e) => e.key === "Enter" && onSubmit?.()}
          disabled={locked}
          placeholder={t("quiz.fillPlaceholder")}
          autoCapitalize="off"
          autoCorrect="off"
          className={cn(
            "h-12 text-base",
            reveal?.correct && "border-emerald-500 bg-emerald-500/10",
            reveal && !reveal.correct && "border-red-500 bg-red-500/10",
          )}
        />
        {reveal && !reveal.correct && (
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
        <ol className="space-y-2">
          {picked.map((item, i) => (
            <li key={item}>
              <OptionButton
                label={String(i + 1)}
                text={item}
                selected
                state={correctOrder ? (correctOrder[i] === item ? "correct" : "wrong") : null}
                disabled={locked}
                onClick={() => onChange(picked.filter((p) => p !== item))}
              />
            </li>
          ))}
        </ol>
        {remaining.length > 0 && (
          <div className="space-y-2 rounded-xl border-2 border-dashed p-2">
            {remaining.map((item) => (
              <OptionButton key={item} text={item} selected={false} disabled={locked} onClick={() => onChange([...picked, item])} />
            ))}
          </div>
        )}
        {correctOrder && !reveal?.correct && (
          <ol className="list-decimal space-y-1 rounded-xl bg-muted p-3 pl-8 text-sm">
            {correctOrder.map((s) => (
              <li key={s}>{s}</li>
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
