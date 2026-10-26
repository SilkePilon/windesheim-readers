import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Copy, Crown, LogOut, Play, Swords, Timer, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Page, PageHeader } from "@/components/page";
import { QuestionInput } from "@/components/question-input";
import { QuestionPrompt } from "@/components/quiz";
import { useInvalidateProgress, useMe, useReaders } from "@/lib/queries";
import type { PublicQuestion } from "@/lib/types";
import { cn } from "@/lib/utils";

// ---------- protocol types ----------

interface RankEntry {
  rank: number;
  id: string;
  name: string;
  score: number;
  streak: number;
}
interface RoomMsg {
  t: "room";
  code: string;
  title: string;
  hostId: string;
  state: "lobby" | "question" | "reveal" | "ended";
  index: number;
  total: number;
  players: RankEntry[];
}
interface QuestionMsg {
  t: "question";
  index: number;
  total: number;
  question: PublicQuestion;
  endsAt: number;
  durationMs: number;
}
interface RevealMsg {
  t: "reveal";
  index: number;
  correctAnswer: unknown;
  explanation: string;
  counts: Record<string, number>;
  results: Record<string, { answer: unknown; correct: boolean; points: number } | null>;
  ranking: RankEntry[];
}
interface EndMsg {
  t: "end";
  ranking: RankEntry[];
  xp: Record<string, number>;
}

function useBattleSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const queue = useRef<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<RoomMsg | null>(null);
  const [question, setQuestion] = useState<QuestionMsg | null>(null);
  const [reveal, setReveal] = useState<RevealMsg | null>(null);
  const [end, setEnd] = useState<EndMsg | null>(null);
  const [progress, setProgress] = useState<{ answered: number; total: number } | null>(null);
  const [answeredIndex, setAnsweredIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= 1) return wsRef.current;
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/battle/ws`);
    wsRef.current = ws;
    ws.onopen = () => {
      setConnected(true);
      for (const m of queue.current.splice(0)) ws.send(m);
    };
    ws.onclose = () => setConnected(false);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string);
      switch (msg.t) {
        case "room":
          setRoom(msg);
          break;
        case "question":
          setQuestion(msg);
          setReveal(null);
          setProgress(null);
          break;
        case "reveal":
          setReveal(msg);
          break;
        case "end":
          setEnd(msg);
          break;
        case "progress":
          setProgress(msg);
          break;
        case "answered":
          setAnsweredIndex(msg.index);
          break;
        case "kicked":
          setError("KICKED");
          setRoom(null);
          break;
        case "error":
          setError(msg.error);
          break;
      }
    };
    return ws;
  }, []);

  const send = useCallback(
    (msg: unknown) => {
      setError(null);
      const ws = connect();
      const data = JSON.stringify(msg);
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
      else queue.current.push(data);
    },
    [connect],
  );

  const leave = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setRoom(null);
    setQuestion(null);
    setReveal(null);
    setEnd(null);
    setAnsweredIndex(null);
  }, []);

  useEffect(() => () => wsRef.current?.close(), []);

  return { connected, room, question, reveal, end, progress, answeredIndex, error, send, leave };
}

// ---------- screens ----------

function Countdown({ endsAt, durationMs }: { endsAt: number; durationMs: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, endsAt - now);
  return (
    <div className="flex items-center gap-3">
      <Progress value={(left / durationMs) * 100} className={cn("h-3 flex-1", left < 5000 && "[&>*]:bg-red-500")} />
      <span className={cn("flex w-10 items-center gap-1 font-mono text-sm font-semibold tabular-nums", left < 5000 && "text-red-500")}>
        <Timer className="size-4" />
        {Math.ceil(left / 1000)}
      </span>
    </div>
  );
}

function Setup({ onCreate, onJoin, initialCode }: { onCreate: (ids: string[], count: number, hostPlays: boolean) => void; onJoin: (code: string) => void; initialCode?: string }) {
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
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="border-primary/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5 text-primary" /> {t("battle.joinTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <InputOTP maxLength={6} value={code} onChange={setCode} inputMode="numeric" pattern="^[0-9]*$" onComplete={(v: string) => onJoin(v)}>
            <InputOTPGroup>
              {Array.from({ length: 6 }, (_, i) => (
                <InputOTPSlot key={i} index={i} className="size-11 text-lg md:size-12" />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <Button size="lg" className="w-full" disabled={code.length !== 6} onClick={() => onJoin(code)}>
            {t("battle.join")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Swords className="size-5 text-primary" /> {t("battle.hostTitle")}
          </CardTitle>
          <CardDescription>{t("battle.pickLessons")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-h-64 space-y-3 overflow-y-auto">
            {readers?.map((r) => (
              <div key={r.id}>
                <div className="mb-1.5 text-xs font-semibold text-muted-foreground">{r.title}</div>
                <div className="flex flex-wrap gap-1.5">
                  {r.lessons.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      title={l.title}
                      onClick={() => toggle(l.id)}
                      className={cn(
                        "rounded-lg border px-2.5 py-1 font-mono text-sm transition-colors",
                        selected.has(l.id) ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/50",
                      )}
                    >
                      {l.code}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <Field>
            <FieldLabel htmlFor="count">{t("battle.questionCount")}</FieldLabel>
            <Input id="count" type="number" min={3} max={30} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-24" />
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="hp">{t("battle.hostPlays")}</FieldLabel>
              <FieldDescription>{t("battle.hostPlaysHint")}</FieldDescription>
            </FieldContent>
            <Switch id="hp" checked={hostPlays} onCheckedChange={setHostPlays} />
          </Field>
          <Button size="lg" className="w-full" disabled={!selected.size} onClick={() => onCreate([...selected], Math.min(30, Math.max(3, count)), hostPlays)}>
            <Swords /> {t("battle.create")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Leaderboard({ ranking, meId, limit = 5, xp }: { ranking: RankEntry[]; meId?: string; limit?: number; xp?: Record<string, number> }) {
  const { t } = useTranslation();
  const shown = ranking.slice(0, limit);
  const me = ranking.find((r) => r.id === meId);
  return (
    <div className="divide-y overflow-hidden rounded-xl border bg-card">
      {[...shown, ...(me && !shown.includes(me) ? [me] : [])].map((p) => (
        <div key={p.id} className={cn("flex items-center gap-3 px-4 py-2.5", p.id === meId && "bg-primary/10")}>
          <span className="w-6 text-center font-bold text-muted-foreground">{p.rank === 1 ? <Crown className="mx-auto size-4 text-amber-500" /> : p.rank}</span>
          <span className="flex-1 truncate font-medium">{p.name}</span>
          {p.streak >= 2 && <Badge variant="secondary">🔥 {p.streak}</Badge>}
          {xp?.[p.id] ? <span className="text-xs text-primary">+{xp[p.id]} XP</span> : null}
          <span className="font-semibold tabular-nums">{t("battle.points", { n: p.score })}</span>
        </div>
      ))}
    </div>
  );
}

export default function BattlePage() {
  const { t } = useTranslation();
  const { code: codeParam } = useParams();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const invalidate = useInvalidateProgress();
  const b = useBattleSocket();
  const [answer, setAnswer] = useState<unknown>(undefined);
  const joinedRef = useRef(false);

  // Join via link /battle/123456
  useEffect(() => {
    if (codeParam && /^\d{6}$/.test(codeParam) && !joinedRef.current) {
      joinedRef.current = true;
      b.send({ t: "join", code: codeParam });
    }
  }, [codeParam, b]);

  // Put the room code in the URL so the host can share the link.
  useEffect(() => {
    if (b.room && codeParam !== b.room.code) {
      joinedRef.current = true;
      navigate(`/battle/${b.room.code}`, { replace: true });
    }
  }, [b.room, codeParam, navigate]);

  useEffect(() => setAnswer(undefined), [b.question?.index]);
  useEffect(() => {
    if (b.end) invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.end]);

  const room = b.room;
  const isHost = !!room && room.hostId === me?.user.id;
  const isPlayer = !!room && room.players.some((p) => p.id === me?.user.id);

  const leave = () => {
    b.leave();
    joinedRef.current = false;
    navigate("/battle");
  };

  const errorText = b.error ? (b.error === "KICKED" ? t("battle.kicked") : (t(`battle.errors.${b.error}`, { defaultValue: "" }) as string) || b.error) : null;

  if (!room) {
    return (
      <Page wide>
        <PageHeader title={t("battle.title")} description={t("battle.subtitle")} />
        {errorText && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{errorText}</AlertDescription>
          </Alert>
        )}
        {codeParam && !b.error ? (
          <div className="flex justify-center py-16">
            <Spinner className="size-6" />
          </div>
        ) : (
          <Setup
            initialCode={codeParam}
            onJoin={(code) => b.send({ t: "join", code })}
            onCreate={(lessonIds, count, hostPlays) => b.send({ t: "create", lessonIds, count, hostPlays })}
          />
        )}
      </Page>
    );
  }

  const header = (
    <div className="mb-4 flex items-center gap-2">
      <Badge variant="outline" className="font-mono">#{room.code}</Badge>
      <span className="truncate text-sm text-muted-foreground">{room.title}</span>
      <div className="flex-1" />
      {!b.connected && <Spinner className="text-muted-foreground" />}
      <Button variant="ghost" size="sm" onClick={leave}>
        <LogOut /> {t("battle.leave")}
      </Button>
    </div>
  );

  // ----- lobby -----
  if (room.state === "lobby") {
    const link = `${location.origin}/battle/${room.code}`;
    return (
      <Page wide>
        {header}
        <Card className="mb-4 overflow-hidden">
          <CardContent className="flex flex-col items-center gap-3 bg-gradient-to-br from-primary/15 to-transparent py-8 text-center">
            <p className="text-sm text-muted-foreground">{t("battle.joinWith")}</p>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(link)}
              className="group inline-flex items-center gap-3 font-mono text-5xl font-bold tracking-[0.2em] md:text-7xl"
            >
              {room.code}
              <Copy className="size-5 opacity-0 transition-opacity group-hover:opacity-50" />
            </button>
            <p className="text-xs text-muted-foreground">{link}</p>
          </CardContent>
        </Card>
        <div className="mb-3 flex items-center justify-between">
          <span className="font-semibold">{t("battle.players", { count: room.players.length })}</span>
          {isHost && (
            <Button size="lg" onClick={() => b.send({ t: "start" })} disabled={room.players.length === 0}>
              <Play /> {t("battle.startGame")}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {room.players.map((p) => (
            <span key={p.id} className="animate-pop inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm font-medium">
              {p.id === room.hostId && <Crown className="size-3.5 text-amber-500" />}
              {p.name}
              {isHost && p.id !== me?.user.id && (
                <button type="button" className="ml-1 text-muted-foreground hover:text-destructive" onClick={() => b.send({ t: "kick", playerId: p.id })}>
                  ×
                </button>
              )}
            </span>
          ))}
          {room.players.length === 0 && <p className="text-sm text-muted-foreground">{t("battle.lobby")}</p>}
        </div>
        {!isHost && (
          <p className="mt-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Spinner /> {t("battle.waitingHost")}
          </p>
        )}
      </Page>
    );
  }

  // ----- ended -----
  if (room.state === "ended" && b.end) {
    const top = b.end.ranking.slice(0, 3);
    const myXp = me ? b.end.xp[me.user.id] : 0;
    return (
      <Page>
        {header}
        <h2 className="mb-6 text-center font-heading text-2xl font-semibold">{t("battle.podium")}</h2>
        <div className="mb-6 grid grid-cols-3 items-end gap-2">
          {[1, 0, 2].map((i) => {
            const p = top[i];
            if (!p) return <div key={i} />;
            const heights = ["h-32", "h-24", "h-16"];
            const colors = ["bg-amber-400", "bg-slate-300", "bg-orange-400"];
            return (
              <div key={i} className="animate-pop flex flex-col items-center gap-1 text-center" style={{ animationDelay: `${(2 - i) * 200}ms` }}>
                {i === 0 && <Crown className="size-7 text-amber-500" />}
                <span className="w-full truncate font-semibold">{p.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{p.score}</span>
                <div className={cn("flex w-full items-start justify-center rounded-t-xl pt-2 text-2xl font-bold text-white", heights[i], colors[i])}>{i + 1}</div>
              </div>
            );
          })}
        </div>
        {!!myXp && (
          <p className="mb-4 flex items-center justify-center gap-2 text-lg font-semibold text-primary">
            <Zap className="size-5" /> {t("battle.youEarned", { n: myXp })}
          </p>
        )}
        <Leaderboard ranking={b.end.ranking} meId={me?.user.id} limit={10} xp={b.end.xp} />
        <Button size="lg" className="mt-6 w-full" onClick={leave}>
          {t("battle.playAgain")}
        </Button>
      </Page>
    );
  }

  // ----- question / reveal -----
  const q = b.question;
  if (!q) return <Page>{header}<Spinner /></Page>;
  const revealed = b.reveal && b.reveal.index === q.index ? b.reveal : null;
  const myResult = revealed && me ? revealed.results[me.user.id] : null;
  const hasAnswered = b.answeredIndex === q.index;
  const isLast = q.index + 1 >= q.total;

  return (
    <Page>
      {header}
      <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
        <span>{t("quiz.question", { i: q.index + 1, n: q.total })}</span>
        {b.progress && !revealed && <span>{t("battle.answered", { a: b.progress.answered, n: b.progress.total })}</span>}
      </div>
      {!revealed && <Countdown endsAt={q.endsAt} durationMs={q.durationMs} />}
      <QuestionPrompt text={q.question.prompt} className="my-5 text-xl md:text-2xl" />

      <QuestionInput
        question={q.question}
        value={answer}
        big
        disabled={!isPlayer || hasAnswered}
        reveal={revealed ? { correct: !!myResult?.correct, correctAnswer: revealed.correctAnswer } : null}
        onChange={(v) => {
          if (!isPlayer || hasAnswered || revealed) return;
          setAnswer(v);
          b.send({ t: "answer", index: q.index, answer: v });
        }}
      />

      {hasAnswered && !revealed && (
        <p className="animate-pop mt-4 text-center font-medium text-muted-foreground">{t("battle.youAnswered")}</p>
      )}

      {revealed && (
        <div className="mt-5 space-y-4">
          {isPlayer && (
            <div
              className={cn(
                "animate-pop rounded-xl p-4 text-center text-lg font-bold",
                myResult?.correct ? "bg-emerald-500 text-white" : "bg-red-500 text-white",
              )}
            >
              {myResult ? (myResult.correct ? t("battle.correctLabel", { n: myResult.points }) : t("battle.wrongLabel")) : t("battle.noAnswer")}
            </div>
          )}
          <p className="text-sm text-muted-foreground">{revealed.explanation}</p>
          <Leaderboard ranking={revealed.ranking} meId={me?.user.id} />
        </div>
      )}

      {isHost && (
        <div className="sticky bottom-20 mt-6 md:bottom-4">
          <Button size="lg" className="h-12 w-full" onClick={() => b.send({ t: "next" })}>
            {!revealed ? t("battle.showAnswer") : isLast ? t("battle.finish") : t("battle.nextQuestion")}
          </Button>
        </div>
      )}
    </Page>
  );
}
