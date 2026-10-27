import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport } from "ai";
import { useTranslation } from "react-i18next";
import { Bot, Eraser, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/markdown";
import { Notice } from "@/components/notice";
import { cn } from "@/lib/utils";
import { requestErrorText } from "@/lib/error-text";
import { CharCounter } from "@/components/char-counter";
import { LIMITS } from "@shared/limits";
import { api } from "@/lib/api";
import type { TutorQuota } from "@/lib/types";

const QUOTA_KEY = ["me", "tutor-quota"];
/** The remaining-questions counter only shows once it gets this low. */
const SHOW_REMAINING_AT = 10;
/** Messages sent per request (the server takes at most LIMITS.tutorMessages and uses 20). */
const TUTOR_HISTORY = 20;

/** True when a chat request failed on the daily tutor limit (the error message is the JSON body). */
export function isTutorLimitError(e: unknown) {
  return e instanceof Error && e.message.includes('"TUTOR_DAILY_LIMIT"');
}

export function TutorTab({ lessonId, code }: { lessonId: string; code: string }) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  // Follow new tutor output only while the student is at the bottom; scrolling up to re-read pauses it.
  const follow = useRef(true);
  const qc = useQueryClient();
  // Today's quota; null when unlimited (or for admins).
  const { data: quotaData } = useQuery({
    queryKey: QUOTA_KEY,
    queryFn: () => api.get<{ tutor: TutorQuota | null }>("/me/tutor-quota"),
  });
  const quota = quotaData?.tutor ?? null;
  const refreshQuota = () => void qc.invalidateQueries({ queryKey: QUOTA_KEY });
  const { messages, sendMessage, regenerate, status, stop, setMessages, error } = useChat({
    id: `tutor-${lessonId}`,
    transport: new DefaultChatTransport({
      api: `/api/lessons/${lessonId}/chat`,
      credentials: "include",
      // Only the recent history: the server caps it (and uses the last 20 messages anyway).
      prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => ({
        body: { id, messages: messages.slice(-TUTOR_HISTORY), trigger, messageId },
      }),
    }),
    onFinish: refreshQuota,
    onError: refreshQuota,
  });
  const busy = status === "submitted" || status === "streaming";
  const limitReached = isTutorLimitError(error) || quota?.remaining === 0;
  const showRemaining = !!quota && !limitReached && quota.remaining <= SHOW_REMAINING_AT;

  useEffect(() => {
    const page = () => document.scrollingElement ?? document.documentElement;
    const atBottom = () => {
      const el = page();
      return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };
    const onScroll = () => {
      follow.current = atBottom();
    };
    // Streaming text and markdown re-renders change the height without a new message, so watch the list itself.
    const ro = new ResizeObserver(() => {
      if (follow.current) page().scrollTop = page().scrollHeight;
    });
    if (listRef.current) ro.observe(listRef.current);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const send = (raw: string) => {
    const text = raw.trim().slice(0, LIMITS.tutorMessage.max);
    if (!text || busy || limitReached) return;
    follow.current = true;
    // Count the question right away; the server's number replaces it when the answer is done.
    if (quota) qc.setQueryData(QUOTA_KEY, { tutor: { ...quota, used: quota.used + 1, remaining: Math.max(0, quota.remaining - 1) } });
    void sendMessage({ text });
    setInput("");
  };

  return (
    <div className="flex min-h-[60dvh] flex-col">
      <div ref={listRef} className="flex-1 space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center py-6 text-center">
            <div className="mb-3 grid size-14 place-items-center rounded-[18px] bg-gold text-gold-foreground shadow-[0_4px_0_var(--gold-shade)]">
              <Bot className="size-7" />
            </div>
            <h2 className="font-heading text-lg font-semibold">{t("tutor.title")}</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("tutor.intro", { code })}</p>
            <div className="mt-6 grid w-full gap-3 sm:grid-cols-2">
              {(t("tutor.suggestions", { returnObjects: true }) as string[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  disabled={limitReached}
                  className="rounded-[18px] bg-card px-4 py-3 text-left text-sm font-bold shadow-[0_4px_0_var(--chunky)] transition-[translate,box-shadow] duration-100 outline-none hover:brightness-[1.03] disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-[4px] active:shadow-none motion-reduce:transition-none motion-reduce:active:translate-y-0 motion-reduce:active:shadow-[0_4px_0_var(--chunky)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[88%] min-w-0 rounded-[20px] px-4 py-2.5",
                m.role === "user"
                  ? "rounded-br-[6px] bg-primary text-primary-foreground shadow-[0_3px_0_var(--primary-shade)]"
                  : "rounded-bl-[6px] bg-card shadow-[0_3px_0_var(--chunky)]",
              )}
            >
              {m.parts.map((p, i) =>
                p.type === "text" ? (
                  m.role === "user" ? (
                    <p key={i} className="text-[15px] whitespace-pre-wrap">{p.text}</p>
                  ) : (
                    <Markdown key={i} className="text-[15px]">{p.text}</Markdown>
                  )
                ) : null,
              )}
            </div>
          </div>
        ))}
        {status === "submitted" && (
          <div className="flex gap-1 px-2">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-2 animate-bounce rounded-full bg-muted-foreground/50" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
        )}
        {limitReached ? (
          <Notice tone="info" title={t("tutor.limitTitle")} description={t("tutor.limitText")} />
        ) : error && (
          <Notice
            title={t("tutor.failed")}
            description={requestErrorText(error, t, t("common.errorHint"))}
            action={
              <Button variant="chunky" size="lg" onClick={() => void regenerate()} disabled={busy}>
                {t("common.retry")}
              </Button>
            }
          />
        )}
      </div>

      {/* Sits above the floating dock on mobile (16px inset + 60px dock + 5px shadow + gap). */}
      <div className="sticky bottom-[calc(92px+env(safe-area-inset-bottom))] z-20 rounded-[22px] bg-card p-2 shadow-[0_5px_0_var(--chunky)] md:bottom-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2"
        >
          {messages.length > 0 && (
            <Button type="button" variant="ghost" size="icon-lg" className="rounded-[12px]" onClick={() => setMessages([])} title={t("tutor.clear")} aria-label={t("tutor.clear")} disabled={busy}>
              <Eraser />
            </Button>
          )}
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={LIMITS.tutorMessage.max}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={limitReached ? t("tutor.limitPlaceholder") : t("tutor.placeholder")}
            disabled={limitReached}
            rows={1}
            className="max-h-32 min-h-10 flex-1 resize-none border-0 bg-transparent text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          {busy ? (
            <Button type="button" size="icon-lg" variant="chunky-surface" className="rounded-[12px] bg-accent [--press:3px] dark:bg-secondary" onClick={() => stop()} aria-label={t("tutor.stop")}>
              <Square />
            </Button>
          ) : (
            <Button type="submit" size="icon-lg" variant="chunky" className="rounded-[12px] [--press:3px]" disabled={!input.trim() || limitReached} aria-label={t("tutor.send")}>
              <Send />
            </Button>
          )}
        </form>
        <p className="flex justify-between gap-2 px-2 pt-1 text-[11px] text-muted-foreground">
          <span>{t("tutor.disclaimer")}</span>
          <CharCounter value={input} max={LIMITS.tutorMessage.max} />
          {showRemaining && (
            <span className="shrink-0 font-bold text-foreground/70 tabular-nums" aria-live="polite">
              {t("tutor.remaining", { count: quota.remaining })}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
