import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useReaders } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { GOLD_BUTTON, StageLogo } from "./stage";

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
  const [count, setCount] = useState(10);
  const [hostPlays, setHostPlays] = useState(true);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="grid items-start gap-5 md:grid-cols-2">
      <section className="dark stage flex flex-col items-center gap-5 rounded-[24px] bg-background px-4 pt-6 pb-6 text-center text-foreground shadow-[0_5px_0_var(--chunky)] sm:px-6">
        <StageLogo />
        <h2 className="font-heading text-xl font-semibold text-balance">{t("battle.joinTitle")}</h2>
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
                className="size-10 rounded-[12px] border-0 bg-white font-heading text-2xl font-semibold text-[#241a4a] shadow-[0_4px_0_var(--chunky)] first:rounded-[12px] first:border-l-0 last:rounded-[12px] data-[active=true]:ring-gold sm:size-12 dark:bg-white [&_.animate-caret-blink]:bg-[#241a4a]"
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
        <Button variant="chunky" size="xl" className={cn("w-full", GOLD_BUTTON)} disabled={code.length !== 6} onClick={() => onJoin(code)}>
          {t("battle.join")}
        </Button>
      </section>

      <Card className="gap-5 px-4 py-5 sm:px-6">
        <div>
          <h2 className="flex items-center gap-2 font-heading text-xl font-semibold">
            <Swords className="size-5 shrink-0 text-primary" /> {t("battle.hostTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("battle.pickLessons")}</p>
        </div>
        <div className="max-h-64 space-y-3 overflow-y-auto px-0.5 pb-1">
          {readers?.map((r) => (
            <div key={r.id}>
              <div className="mb-1.5 text-xs font-bold text-muted-foreground">{r.title}</div>
              <div className="flex flex-wrap gap-2 pb-1">
                {r.lessons.map((l) => {
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
          ))}
        </div>
        <Field orientation="horizontal" className="items-center">
          <FieldLabel htmlFor="count">{t("battle.questionCount")}</FieldLabel>
          <Input
            id="count"
            type="number"
            min={3}
            max={30}
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
          <Switch id="hp" size="lg" checked={hostPlays} onCheckedChange={setHostPlays} />
        </Field>
        <Button
          variant="chunky"
          size="xl"
          className="w-full"
          disabled={!selected.size}
          onClick={() => onCreate([...selected], Number.isFinite(count) ? Math.min(30, Math.max(3, Math.round(count))) : 10, hostPlays)}
        >
          <Swords /> {t("battle.create")}
        </Button>
      </Card>
    </div>
  );
}
