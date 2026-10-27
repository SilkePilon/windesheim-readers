import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useReaders } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { GOLD_BUTTON, StageLogo } from "./stage";
import { COUNT_MAX, COUNT_MIN, DEFAULT_BATTLE_SETTINGS } from "@shared/battle";

/** Join (a small dark stage card) and host setup, shown inside the normal app shell. */
export function Setup({
  onCreate,
  onJoin,
  initialCode,
}: {
  onCreate: (ids: string[], count: number, hostPlays: boolean) => void;
  onJoin: (code: string) => void;
  initialCode?: string;
}) {
  const { t } = useTranslation();
  const { data: readers } = useReaders();
  const [code, setCode] = useState(initialCode ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [count, setCount] = useState<number>(DEFAULT_BATTLE_SETTINGS.count);
  const [hostPlays, setHostPlays] = useState(true);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  /** Select a whole group (reader or week) in one tap; tapping a fully selected group clears it. */
  const toggleGroup = (ids: string[]) =>
    setSelected((s) => {
      const n = new Set(s);
      const all = ids.every((id) => n.has(id));
      for (const id of ids) {
        if (all) n.delete(id);
        else n.add(id);
      }
      return n;
    });

  return (
    <div className="grid items-start gap-5 md:grid-cols-2">
      <section className="dark stage flex flex-col items-center gap-5 rounded-[24px] bg-background px-4 pt-6 pb-6 text-center text-foreground shadow-[0_5px_0_var(--chunky)] sm:px-6">
        <StageLogo />
        <h2 className="font-heading text-xl font-semibold text-balance">
          {t("battle.joinTitle")}
        </h2>
        <InputOTP
          maxLength={6}
          value={code}
          onChange={setCode}
          inputMode="numeric"
          pattern="^[0-9]*$"
          onComplete={(v: string) => onJoin(v)}
          aria-label={t("battle.codePlaceholder")}
        >
          <InputOTPGroup className="gap-1.5 sm:gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <InputOTPSlot
                key={i}
                index={i}
                className="size-9 rounded-[12px] border-0 bg-white font-heading text-xl min-[360px]:size-10 min-[360px]:text-2xl font-semibold text-[#241a4a] shadow-[0_4px_0_var(--chunky)] first:rounded-[12px] first:border-l-0 last:rounded-[12px] data-[active=true]:ring-gold sm:size-12 dark:bg-white [&_.animate-caret-blink]:bg-[#241a4a]"
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
        <Button
          variant="chunky"
          size="xl"
          className={cn("w-full", GOLD_BUTTON)}
          disabled={code.length !== 6}
          onClick={() => onJoin(code)}
        >
          {t("battle.join")}
        </Button>
      </section>

      <Card className="gap-5 px-4 py-5 sm:px-6">
        <div>
          <h2 className="flex items-center gap-2 font-heading text-xl font-semibold">
            <Swords className="size-5 shrink-0 text-primary" />{" "}
            {t("battle.hostTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("battle.pickLessons")}
          </p>
        </div>
        <div className="max-h-80 space-y-4 overflow-y-auto px-0.5 pb-1">
          {readers?.map((r) => {
            const readerIds = r.lessons.map((l) => l.id);
            const weeks = [...new Set(r.lessons.map((l) => l.week))].sort(
              (a, b) => a - b,
            );
            return (
              <div key={r.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 truncate text-xs font-bold text-muted-foreground">
                    {r.title}
                  </div>
                  <GroupToggle
                    label={t("battle.selectAll")}
                    aria={t("battle.selectAllAria", { reader: r.title })}
                    ids={readerIds}
                    selected={selected}
                    onToggle={toggleGroup}
                  />
                </div>
                {weeks.map((w) => {
                  const lessons = r.lessons.filter((l) => l.week === w);
                  return (
                    <div key={w} className="space-y-1.5">
                      {weeks.length > 1 && (
                        <GroupToggle
                          label={t("common.week", { n: w })}
                          aria={t("battle.selectWeekAria", { n: w })}
                          ids={lessons.map((l) => l.id)}
                          selected={selected}
                          onToggle={toggleGroup}
                          subtle
                        />
                      )}
                      <div className="flex flex-wrap gap-2 pb-1">
                        {lessons.map((l) => {
                          const on = selected.has(l.id);
                          return (
                            <button
                              key={l.id}
                              type="button"
                              title={l.title}
                              aria-pressed={on}
                              onClick={() => toggle(l.id)}
                              className={cn(
                                "rounded-[12px] px-3 py-1.5 font-heading text-[15px] font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
                                on
                                  ? "bg-primary text-primary-foreground shadow-[0_3px_0_var(--primary-shade)]"
                                  : "bg-accent text-primary shadow-[0_3px_0_var(--chunky)] hover:bg-secondary",
                              )}
                            >
                              {l.code}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="-mt-2 flex min-h-8 items-center justify-between gap-3 text-sm font-bold">
          <span
            className={cn(
              selected.size ? "text-primary" : "text-muted-foreground",
            )}
            aria-live="polite"
          >
            {t("battle.selectedCount", { count: selected.size })}
          </span>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-[10px] px-2 py-1 text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {t("battle.clearSelection")}
            </button>
          )}
        </div>
        <Field orientation="horizontal" className="items-center">
          <FieldLabel htmlFor="count">{t("battle.questionCount")}</FieldLabel>
          <Input
            id="count"
            type="number"
            min={COUNT_MIN}
            max={COUNT_MAX}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="h-11 w-20 shrink-0 rounded-[12px] border-2 text-center font-heading text-lg md:text-lg"
          />
        </Field>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="hp">{t("battle.hostPlays")}</FieldLabel>
            <FieldDescription>{t("battle.hostPlaysHint")}</FieldDescription>
          </FieldContent>
          <Switch
            id="hp"
            size="lg"
            checked={hostPlays}
            onCheckedChange={setHostPlays}
          />
        </Field>
        <Button
          variant="chunky"
          size="xl"
          className="w-full"
          disabled={!selected.size}
          onClick={() =>
            onCreate(
              [...selected],
              Number.isFinite(count)
                ? Math.min(COUNT_MAX, Math.max(COUNT_MIN, Math.round(count)))
                : DEFAULT_BATTLE_SETTINGS.count,
              hostPlays,
            )
          }
        >
          <Swords /> {t("battle.create")}
        </Button>
      </Card>
    </div>
  );
}

/** "Alles" / "Week 3" chip: selects every lesson in the group, or clears them when all are on. */
function GroupToggle({
  label,
  aria,
  ids,
  selected,
  onToggle,
  subtle,
}: {
  label: string;
  aria: string;
  ids: string[];
  selected: Set<string>;
  onToggle: (ids: string[]) => void;
  subtle?: boolean;
}) {
  const on = ids.length > 0 && ids.every((id) => selected.has(id));
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={aria}
      onClick={() => onToggle(ids)}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-extrabold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
        on
          ? "bg-success text-white shadow-[0_2px_0_var(--success-shade)]"
          : subtle
            ? "bg-transparent text-muted-foreground ring-2 ring-border ring-inset hover:text-foreground"
            : "bg-secondary text-primary shadow-[0_2px_0_var(--chunky)] hover:bg-accent",
      )}
    >
      {on && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
      {label}
    </button>
  );
}
