import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import {
  COUNT_MAX,
  COUNT_MIN,
  DIFFICULTIES,
  POINTS_MODES,
  QUESTION_SECONDS,
  type BattleSettings,
} from "@shared/battle";

/** One labelled row of segmented choices (radix toggle group: arrow keys move, Space/Enter picks). */
function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <p id={id} className="mb-1.5 text-sm font-bold text-muted-foreground">
        {label}
      </p>
      <ToggleGroup
        type="single"
        spacing={1}
        aria-labelledby={id}
        disabled={disabled}
        value={String(value)}
        // Radix sends "" when the active item is pressed again: keep the current value.
        onValueChange={(v) => {
          const opt = options.find((o) => String(o.value) === v);
          if (opt && opt.value !== value) onChange(opt.value);
        }}
        className="grid w-full auto-cols-fr grid-flow-col rounded-[16px] bg-background p-1"
      >
        {options.map((o) => (
          <ToggleGroupItem
            key={String(o.value)}
            value={String(o.value)}
            className={cn(
              "h-auto min-h-10 min-w-0 rounded-[12px] px-1.5 py-1.5 font-heading text-[14px] leading-tight font-semibold whitespace-normal text-white/80",
              "hover:bg-white/10 hover:text-white data-[state=on]:bg-gold data-[state=on]:text-gold-foreground data-[state=on]:shadow-[0_3px_0_var(--gold-shade)]",
            )}
          >
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Field orientation="horizontal" className="items-center">
      <FieldContent>
        <FieldLabel htmlFor={id} className="font-heading text-[15px] font-semibold">
          {label}
        </FieldLabel>
        <FieldDescription className="text-[13px] font-semibold text-muted-foreground">{hint}</FieldDescription>
      </FieldContent>
      <Switch id={id} size="lg" checked={checked} onCheckedChange={onChange} className="data-unchecked:bg-white/25 dark:data-unchecked:bg-white/25" />
    </Field>
  );
}

/** Host-only lobby card: every change goes to the server, which broadcasts the new room state. */
export function SettingsCard({
  settings,
  total,
  onChange,
  notice,
}: {
  settings: BattleSettings;
  /** Questions actually in the room (may be fewer than `settings.count`). */
  total: number;
  onChange: (patch: Partial<BattleSettings>) => void;
  notice?: ReactNode;
}) {
  const { t } = useTranslation();
  const id = useId();
  const countLabelId = `${id}-count`;
  const stepCount = (d: number) => {
    const next = Math.min(COUNT_MAX, Math.max(COUNT_MIN, settings.count + d));
    if (next !== settings.count) onChange({ count: next });
  };
  return (
    <section aria-labelledby={`${id}-title`} className="mt-6 rounded-[20px] bg-card p-4 shadow-[0_5px_0_var(--chunky)] md:p-5">
      <h2 id={`${id}-title`} className="flex items-center gap-2 font-heading text-lg font-semibold">
        <Settings2 className="size-5 shrink-0 text-gold" aria-hidden /> {t("battle.settings.title")}
      </h2>
      {notice && <div className="mt-3">{notice}</div>}
      <div className="mt-3 grid gap-4 md:grid-cols-2 md:gap-x-5">
        <Segmented
          label={t("battle.settings.time")}
          value={settings.questionSeconds}
          options={QUESTION_SECONDS.map((n) => ({ value: n, label: t("battle.settings.seconds", { n }) }))}
          onChange={(questionSeconds) => onChange({ questionSeconds })}
        />
        <Segmented
          label={t("battle.settings.difficulty")}
          value={settings.difficulty}
          options={DIFFICULTIES.map((d) => ({ value: d, label: t(`battle.settings.difficulties.${d}`) }))}
          onChange={(difficulty) => onChange({ difficulty })}
        />
        <Segmented
          label={t("battle.settings.points")}
          value={settings.points}
          options={POINTS_MODES.map((p) => ({ value: p, label: t(`battle.settings.pointsModes.${p}`) }))}
          onChange={(points) => onChange({ points })}
        />
        <div className="min-w-0">
          <p id={countLabelId} className="mb-1.5 text-sm font-bold text-muted-foreground">
            {t("battle.settings.count")}
          </p>
          <div role="group" aria-labelledby={countLabelId} className="flex items-center gap-3">
            <Button
              variant="chunky-surface"
              size="icon-xl"
              className="bg-background"
              aria-label={t("battle.settings.fewer")}
              disabled={settings.count <= COUNT_MIN}
              onClick={() => stepCount(-1)}
            >
              <Minus strokeWidth={3} />
            </Button>
            <output aria-live="polite" className="min-w-10 text-center font-heading text-2xl font-semibold tabular-nums">
              {settings.count}
            </output>
            <Button
              variant="chunky-surface"
              size="icon-xl"
              className="bg-background"
              aria-label={t("battle.settings.more")}
              disabled={settings.count >= COUNT_MAX}
              onClick={() => stepCount(1)}
            >
              <Plus strokeWidth={3} />
            </Button>
            {total < settings.count && (
              <span className="text-[13px] font-bold text-muted-foreground">{t("battle.settings.available", { n: total })}</span>
            )}
          </div>
        </div>
      </div>
      <div className="mt-5 grid gap-4 border-t-2 border-background/50 pt-4">
        <Toggle
          id={`${id}-speed`}
          label={t("battle.settings.speedBonus")}
          hint={t("battle.settings.speedBonusHint")}
          checked={settings.speedBonus}
          onChange={(speedBonus) => onChange({ speedBonus })}
        />
        <Toggle
          id={`${id}-streak`}
          label={t("battle.settings.streakBonus")}
          hint={t("battle.settings.streakBonusHint")}
          checked={settings.streakBonus}
          onChange={(streakBonus) => onChange({ streakBonus })}
        />
        <Toggle
          id={`${id}-board`}
          label={t("battle.settings.showScoreboard")}
          hint={t("battle.settings.showScoreboardHint")}
          checked={settings.showScoreboard}
          onChange={(showScoreboard) => onChange({ showScoreboard })}
        />
      </div>
    </section>
  );
}

/** Read-only summary for players (and the host's presentation view): key + non-default settings. */
export function SettingsChips({ settings, total, className }: { settings: BattleSettings; total: number; className?: string }) {
  const { t } = useTranslation();
  const chips: { key: string; label: string; gold?: boolean }[] = [
    { key: "time", label: t("battle.settings.chips.time", { n: settings.questionSeconds }) },
    {
      key: "questions",
      label: t("battle.settings.chips.questions", { count: total, difficulty: t(`battle.settings.difficulties.${settings.difficulty}`) }),
    },
  ];
  if (settings.points !== "normal") chips.push({ key: "points", label: t(`battle.settings.pointsModes.${settings.points}`), gold: true });
  if (!settings.speedBonus) chips.push({ key: "speed", label: t("battle.settings.chips.noSpeedBonus") });
  if (!settings.streakBonus) chips.push({ key: "streak", label: t("battle.settings.chips.noStreakBonus") });
  if (!settings.showScoreboard) chips.push({ key: "board", label: t("battle.settings.chips.noScoreboard") });
  return (
    <ul aria-label={t("battle.settings.chips.label")} className={cn("flex flex-wrap gap-2", className)}>
      {chips.map((c) => (
        <li
          key={c.key}
          className={cn(
            "rounded-full px-3 py-1 font-heading text-sm font-semibold",
            c.gold ? "bg-gold text-gold-foreground shadow-[0_3px_0_var(--gold-shade)]" : "bg-card text-foreground shadow-[0_3px_0_var(--chunky)]",
          )}
        >
          {c.label}
        </li>
      ))}
    </ul>
  );
}
