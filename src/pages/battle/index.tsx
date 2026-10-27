import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Spinner } from "@/components/ui/spinner";
import { Notice } from "@/components/notice";
import { AppLayout } from "@/components/app-layout";
import { Page, PageHeader } from "@/components/page";
import { StudyShell } from "@/components/shell/study-shell";
import { useInvalidateProgress, useMe } from "@/lib/queries";
import { celebrate } from "@/lib/celebrate";
import { useBattleSocket } from "./use-battle-socket";
import { Setup } from "./setup";
import { Lobby, Play, Results, StartCountdown } from "./stage";
import { CloseConfirm } from "./close-confirm";
import { battleErrorCopy } from "./error-copy";

/**
 * Live quiz battle. Joining and hosting happen in the normal app shell; once you're in
 * a room (lobby, play, results) it switches to full-screen study mode on the dark stage,
 * in both themes. The route sits outside AppLayout so the page can pick its own shell
 * while the socket (and this component) stays mounted.
 */
export default function BattlePage() {
  const { t, i18n } = useTranslation();
  const { code: codeParam } = useParams();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const invalidate = useInvalidateProgress();
  const b = useBattleSocket();
  // Keyed by question index so a new question never shows the previous pick.
  const [answer, setAnswer] = useState<{ index: number; value: unknown } | null>(null);
  const [confirming, setConfirming] = useState(false);
  // The code this page has joined (or left). Leaving keeps it until the URL drops the
  // code: navigation commits after the state reset, and a re-run of the join effect with
  // the old code would otherwise put you straight back in the room.
  const joinedRef = useRef<string | null>(null);
  // The socket closes on unmount, so a remount (StrictMode in dev) must join again.
  useEffect(
    () => () => {
      joinedRef.current = null;
    },
    [],
  );

  // Join via link /battle/123456
  useEffect(() => {
    if (!codeParam) joinedRef.current = null;
    else if (/^\d{6}$/.test(codeParam) && joinedRef.current !== codeParam) {
      joinedRef.current = codeParam;
      b.send({ t: "join", code: codeParam });
    }
  }, [codeParam, b]);

  // Put the room code in the URL so the host can share the link.
  useEffect(() => {
    if (b.room && codeParam !== b.room.code) {
      joinedRef.current = b.room.code;
      navigate(`/battle/${b.room.code}`, { replace: true });
    }
  }, [b.room, codeParam, navigate]);

  // Out of the room (left, removed, ended): a next battle starts without an old pick or
  // a confirm dialog that was open when the room went away.
  useEffect(() => {
    if (!b.room) {
      setAnswer(null);
      setConfirming(false);
    }
  }, [b.room]);

  // Removed or the host ended it: back to the join/host screen, which shows why.
  useEffect(() => {
    if ((b.error === "CLOSED" || b.error === "KICKED") && codeParam) navigate("/battle", { replace: true });
  }, [b.error, codeParam, navigate]);

  useEffect(() => {
    if (!b.end) return;
    invalidate();
    const mine = me && b.end.badges?.[me.user.id];
    if (mine?.length) celebrate({ newBadges: mine });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.end]);

  const room = b.room;
  const meId = me?.user.id;
  const isHost = !!room && room.hostId === meId;
  const isPlayer = !!room && room.players.some((p) => p.id === meId);

  // The host ends the battle for everyone; a player only walks out.
  const leave = (how: "leave" | "end") => {
    setConfirming(false);
    b.leave(how);
    navigate("/battle");
  };

  const errorCopy = b.error ? battleErrorCopy(i18n, b.error) : null;
  // In the lobby a NOT_ENOUGH_QUESTIONS answers a settings change (count / difficulty).
  const lobbyCopy =
    b.error === "NOT_ENOUGH_QUESTIONS" ? (t("battle.settings.notEnough", { returnObjects: true }) as { title: string; description: string }) : errorCopy;
  const lobbyNotice = lobbyCopy && <Notice tone="warning" variant="inset" title={lobbyCopy.title} description={lobbyCopy.description} />;

  if (!room) {
    return (
      <AppLayout>
        <Page className="max-w-4xl">
          <PageHeader title={t("battle.title")} description={t("battle.subtitle")} />
          {errorCopy && (
            <Notice
              tone={b.error === "CLOSED" ? "info" : b.error === "KICKED" ? "warning" : "danger"}
              title={errorCopy.title}
              description={
                errorCopy.detail ? (
                  <>
                    {errorCopy.description} <span className="text-xs opacity-70">({errorCopy.detail})</span>
                  </>
                ) : (
                  errorCopy.description
                )
              }
              className="mb-5"
            />
          )}
          {codeParam && !b.error ? (
            <div className="flex justify-center py-16">
              <Spinner className="size-6 text-primary" />
            </div>
          ) : (
            <Setup
              // Not the code of a battle you were just removed from or that just ended.
              initialCode={b.error === "CLOSED" || b.error === "KICKED" ? undefined : codeParam}
              onJoin={(code) => b.send({ t: "join", code })}
              onCreate={(lessonIds, count, hostPlays) => b.send({ t: "create", lessonIds, count, hostPlays })}
            />
          )}
        </Page>
      </AppLayout>
    );
  }

  const q = b.question;
  const reveal = q && b.reveal?.index === q.index ? b.reveal : null;
  const ended = room.state === "ended" && b.end;

  let body;
  let progress: number | undefined;
  if (room.state === "countdown") {
    body = b.countdown ? (
      <StartCountdown endsAt={b.countdown.endsAt} durationMs={b.countdown.durationMs} />
    ) : (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-7" />
      </div>
    );
  } else if (room.state === "lobby") {
    body = (
      <Lobby
        room={room}
        meId={meId}
        isHost={isHost}
        isPlayer={isPlayer}
        onStart={() => b.send({ t: "start" })}
        onKick={(playerId) => b.send({ t: "kick", playerId })}
        onSettings={(settings) => b.send({ t: "settings", settings })}
        settingsNotice={lobbyNotice}
      />
    );
  } else if (ended) {
    progress = 1;
    body = <Results end={b.end!} meId={meId} onPlayAgain={() => leave("leave")} />;
  } else if (q) {
    progress = (q.index + (reveal ? 1 : 0)) / q.total;
    const picked = answer?.index === q.index ? answer.value : undefined;
    body = (
      <Play
        room={room}
        question={q}
        reveal={reveal}
        progress={b.progress}
        meId={meId}
        isHost={isHost}
        isPlayer={isPlayer}
        answer={picked}
        answered={b.answeredIndex === q.index}
        onAnswer={(value) => {
          if (!isPlayer || picked !== undefined || reveal) return;
          setAnswer({ index: q.index, value });
          b.send({ t: "answer", index: q.index, answer: value });
        }}
        onNext={() => b.send({ t: "next" })}
      />
    );
  } else {
    body = (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-7" />
      </div>
    );
  }

  return (
    <div className="dark stage bg-background text-foreground">
      <StudyShell
        wide
        // Results are final: nothing to confirm. Otherwise ask first.
        onClose={() => (room.state === "ended" ? leave("leave") : setConfirming(true))}
        progress={progress}
        right={!b.connected ? <Spinner className="text-muted-foreground" aria-label={t("battle.connecting")} /> : undefined}
      >
        {body}
      </StudyShell>
      <CloseConfirm
        open={confirming}
        onOpenChange={setConfirming}
        isHost={isHost}
        onConfirm={() => leave(isHost ? "end" : "leave")}
      />
    </div>
  );
}
