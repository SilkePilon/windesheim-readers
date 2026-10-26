import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useTranslation } from "react-i18next";
import { Bot, Eraser, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";

export function TutorTab({ lessonId, code }: { lessonId: string; code: string }) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, stop, setMessages, error } = useChat({
    id: `tutor-${lessonId}`,
    transport: new DefaultChatTransport({ api: `/api/lessons/${lessonId}/chat`, credentials: "include" }),
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    void sendMessage({ text });
    setInput("");
  };

  return (
    <div className="flex min-h-[60dvh] flex-col">
      <div className="flex-1 space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center py-6 text-center">
            <div className="mb-3 rounded-2xl bg-primary/10 p-3 text-primary">
              <Bot className="size-7" />
            </div>
            <h3 className="font-semibold">{t("tutor.title")}</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("tutor.intro", { code })}</p>
            <div className="mt-5 grid w-full gap-2 sm:grid-cols-2">
              {(t("tutor.suggestions", { returnObjects: true }) as string[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-xl border bg-card px-4 py-3 text-left text-sm transition-colors hover:border-primary/50"
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
                "max-w-[88%] rounded-2xl px-4 py-2.5",
                m.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border bg-card",
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
        {error && <p className="text-sm text-destructive">{t("common.error")}: {error.message}</p>}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-20 rounded-2xl border bg-background/95 p-2 shadow-sm backdrop-blur md:bottom-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2"
        >
          {messages.length > 0 && (
            <Button type="button" variant="ghost" size="icon" onClick={() => setMessages([])} title={t("tutor.clear")} disabled={busy}>
              <Eraser />
            </Button>
          )}
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={t("tutor.placeholder")}
            rows={1}
            className="max-h-32 min-h-10 flex-1 resize-none border-0 bg-transparent text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          {busy ? (
            <Button type="button" size="icon" variant="secondary" onClick={() => stop()}>
              <Square />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim()}>
              <Send />
            </Button>
          )}
        </form>
        <p className="px-2 pt-1 text-[11px] text-muted-foreground">{t("tutor.disclaimer")}</p>
      </div>
    </div>
  );
}
