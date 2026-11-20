import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { ChevronDown, ImagePlus, Send, X } from "lucide-react";
import { FEEDBACK_TYPES, type FeedbackContext, type FeedbackType } from "@shared/feedback";
import { stripControl } from "@shared/control";
import { LIMITS } from "@shared/limits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { CharCounter } from "@/components/char-counter";
import { Segmented } from "@/components/game/segmented";
import { api } from "@/lib/api";
import { errorText } from "@/lib/error-text";
import {
  clearDraft,
  closeFeedback,
  collectContext,
  messageValid,
  openDraft,
  prepareScreenshot,
  saveDraft,
  useFeedbackState,
  type FeedbackSeed,
} from "@/lib/feedback";
import { notify } from "@/lib/notify";
import { qk } from "@/lib/queries";
import type { LessonDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

// Tailwind's `md`: a drawer below it, a dialog from it up.
const WIDE = "(min-width: 48rem)";
const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const isWide = () => window.matchMedia(WIDE).matches;

/** The lesson id in the current path (`/lesson/:id`, `/lesson/:id/cards`, ...), if any. */
const lessonIdOf = (pathname: string) => pathname.match(/^\/lesson\/([^/?#]+)/)?.[1];

/**
 * The feedback sheet, opened with `openFeedback()` from anywhere (help button, error
 * toast, crash screen). Lazy-loaded by `FeedbackHost` (one per app, logged in only).
 * A drawer on phones, a dialog on desktop; the draft survives closing within the session.
 */
export default function FeedbackSheet({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const { open, seed } = useFeedbackState();
  const wide = useSyncExternalStore(subscribeWide, isWide, () => true);
  // While a send is in flight the sheet can't be closed (Esc, overlay, swipe, X).
  const [sending, setSending] = useState(false);
  const onOpenChange = (o: boolean) => {
    if (!o && !sending) closeFeedback();
  };
  const block = (e: Event) => sending && e.preventDefault();
  const form = <FeedbackForm userId={userId} seed={seed} sending={sending} setSending={setSending} />;

  const header = (Title: typeof DialogTitle, Description: typeof DialogDescription) => (
    <>
      <Title className="font-heading text-[22px] leading-tight font-semibold text-balance">{t("feedback.title")}</Title>
      <Description className="text-[15px] font-semibold text-balance text-muted-foreground">{t("feedback.description")}</Description>
    </>
  );

  if (wide) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          // Desktop: start in the message box rather than on the type toggle.
          onOpenAutoFocus={(e) => {
            const box = (e.currentTarget as HTMLElement).querySelector<HTMLTextAreaElement>("textarea");
            if (box) {
              e.preventDefault();
              box.focus();
            }
          }}
          onEscapeKeyDown={block}
          onInteractOutside={block}
          className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-[26px] bg-card p-0 ring-0 shadow-[0_6px_0_var(--chunky),0_24px_48px_-16px_rgba(36,26,74,0.35)] sm:max-w-lg dark:shadow-[0_6px_0_var(--chunky),0_24px_48px_-12px_rgba(0,0,0,0.6)]">
          <DialogHeader className="gap-1.5 px-6 pt-6 pb-1 pr-12">{header(DialogTitle, DialogDescription)}</DialogHeader>
          {form}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange} dismissible={!sending}>
      <DrawerContent className="mx-auto max-h-[92dvh] max-w-md rounded-t-[26px] border-0 bg-card data-[vaul-drawer-direction=bottom]:max-h-[92dvh] data-[vaul-drawer-direction=bottom]:rounded-t-[26px] data-[vaul-drawer-direction=bottom]:border-t-0">
        <div className="overflow-y-auto overscroll-contain pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <DrawerHeader className="gap-1.5 px-6 pt-4 pb-1 text-left md:text-left">{header(DrawerTitle, DrawerDescription)}</DrawerHeader>
          {form}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** An object URL for the preview, created and revoked by the effect (StrictMode-safe). */
function useScreenshotUrl(blob: Blob | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return setUrl(null);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

function FeedbackForm({
  userId,
  seed,
  sending,
  setSending,
}: {
  userId: string;
  seed: FeedbackSeed | null;
  sending: boolean;
  setSending: (v: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  const { theme, resolvedTheme } = useTheme();
  const queryClient = useQueryClient();
  const id = useId();

  const [start] = useState(() => openDraft(userId, seed));
  const [type, setTypeState] = useState<FeedbackType>(start.type);
  const [message, setMessageState] = useState(start.message);
  const [screenshot, setScreenshotState] = useState<Blob | null>(start.screenshot);
  const [preparing, setPreparing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const previewUrl = useScreenshotUrl(screenshot);

  // Each change is also kept in the session draft, so closing and reopening keeps it.
  const setType = (v: FeedbackType) => (setTypeState(v), saveDraft(userId, { type: v }));
  const setMessage = (v: string) => (setMessageState(v), saveDraft(userId, { message: v }));
  const setScreenshot = (v: Blob | null) => (setScreenshotState(v), saveDraft(userId, { screenshot: v }));

  // Collected once per open (the form mounts with the sheet); titles come from the query
  // cache only, never fetched.
  const [context] = useState<FeedbackContext>(() => {
    const lessonId = lessonIdOf(pathname);
    const lesson = lessonId ? queryClient.getQueryData<LessonDetail>(qk.lesson(lessonId)) : undefined;
    return collectContext({
      pathname,
      locale: i18n.language,
      theme: theme === "system" && resolvedTheme ? `system (${resolvedTheme})` : (theme ?? "system"),
      reader: lesson?.reader ? { title: lesson.reader.title } : undefined,
      lesson: lesson ? { code: lesson.code, title: lesson.title } : undefined,
      error: seed?.error,
    });
  });

  // Pasted text can carry invisible characters (zero-width, bidi, controls) the server refuses:
  // check and send the message without them.
  const clean = stripControl(message);
  const valid = messageValid(clean);
  const showInvalid = clean.trim().length > 0 && !valid;
  const canSend = valid && !sending && !preparing;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setPreparing(true);
    try {
      const blob = await prepareScreenshot(file);
      if (blob.size > LIMITS.feedback.screenshotBytes) throw new Error("FILE_TOO_LARGE");
      setScreenshot(blob);
    } catch (e) {
      notify.error(errorText(e, t));
    } finally {
      setPreparing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append("type", type);
      form.append("message", clean);
      form.append("context", JSON.stringify(context));
      if (screenshot) form.append("screenshot", screenshot, screenshot.type === "image/webp" ? "screenshot.webp" : "screenshot.jpg");
      const res = await api.post<{ id: string; screenshotDropped?: true }>("/feedback", form);
      notify.success(t("feedback.thanks"));
      if (res.screenshotDropped) notify.info(t("feedback.screenshotDropped"));
      clearDraft();
      setSending(false);
      closeFeedback();
    } catch (e) {
      notify.error(errorText(e, t));
      setSending(false);
      // Keep focus on the send button (aria-disabled, never disabled, so it isn't lost).
      submitRef.current?.focus();
    }
  };

  const hintId = `${id}-hint`;
  return (
    <form
      className="flex flex-col gap-4 px-6 pt-4 pb-2 md:pb-6"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <Segmented
        label={t("feedback.type")}
        value={type}
        onChange={setType}
        options={FEEDBACK_TYPES.map((v) => ({ value: v, label: t(`feedback.types.${v}`) }))}
      />

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={`${id}-message`} className="text-sm font-bold">
            {t("feedback.message")}
          </label>
          <CharCounter value={clean} max={LIMITS.feedback.message.max} />
        </div>
        <Textarea
          id={`${id}-message`}
          value={message}
          maxLength={LIMITS.feedback.message.max}
          placeholder={t(`feedback.placeholder.${type}`)}
          aria-invalid={showInvalid || undefined}
          aria-describedby={hintId}
          disabled={sending}
          onChange={(e) => setMessage(e.target.value)}
          className="max-h-[40dvh] min-h-28 rounded-[16px] text-base"
        />
        <p id={hintId} className={cn("text-xs font-semibold", showInvalid ? "text-danger-shade dark:text-danger" : "text-muted-foreground")}>
          {t("feedback.minChars", { min: LIMITS.feedback.message.min })}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        {screenshot && previewUrl ? (
          <div className="relative w-fit">
            <img
              src={previewUrl}
              alt={t("feedback.screenshotAlt")}
              className="max-h-40 max-w-full rounded-[16px] bg-background object-contain shadow-[0_4px_0_var(--chunky)]"
            />
            <Button
              type="button"
              variant="chunky-surface"
              size="icon-sm"
              aria-label={t("feedback.screenshotRemove")}
              disabled={sending}
              onClick={() => setScreenshot(null)}
              className="absolute -top-2 -right-2 rounded-full [--press:2px]"
            >
              <X className="size-4" strokeWidth={2.6} />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="chunky-surface"
            className="h-11 w-fit gap-2 rounded-[14px] px-4"
            disabled={preparing || sending}
            onClick={() => fileRef.current?.click()}
          >
            {preparing ? <Spinner /> : <ImagePlus className="size-5 text-info" />}
            {preparing ? t("feedback.screenshotPreparing") : t("feedback.screenshot")}
          </Button>
        )}
      </div>

      <ContextList context={context} />

      {/* aria-disabled while sending (send() guards it), so focus stays on the button. */}
      <Button
        ref={submitRef}
        type="submit"
        variant="chunky"
        size="xl"
        className="w-full aria-disabled:cursor-progress"
        disabled={!valid || preparing}
        aria-disabled={sending || undefined}
      >
        {sending ? <Spinner /> : <Send />}
        {sending ? t("feedback.sending") : t("feedback.send")}
      </Button>
    </form>
  );
}

function ContextList({ context: c }: { context: FeedbackContext }) {
  const { t } = useTranslation();
  const rows: [string, ReactNode][] = [
    [t("feedback.ctx.path"), c.path],
    ...(c.readerTitle ? [[t("feedback.ctx.readerTitle"), c.readerTitle] as [string, ReactNode]] : []),
    ...(c.lessonTitle ? [[t("feedback.ctx.lesson"), `${c.lessonCode ? `${c.lessonCode} · ` : ""}${c.lessonTitle}`] as [string, ReactNode]] : []),
    [t("feedback.ctx.appVersion"), c.appVersion],
    [t("feedback.ctx.browser"), c.browser],
    [t("feedback.ctx.viewport"), c.viewport],
    [t("feedback.ctx.locale"), c.locale],
    [t("feedback.ctx.theme"), c.theme],
    [t("feedback.ctx.standalone"), c.standalone ? t("feedback.ctx.yes") : t("feedback.ctx.no")],
    ...(c.error
      ? [
          [t("feedback.ctx.error"), [c.error.status, c.error.code, c.error.message].filter((v) => v !== undefined && v !== "").join(" · ")] as [string, ReactNode],
          ...(c.error.stack ? [[t("feedback.ctx.stack"), t("feedback.ctx.attached")] as [string, ReactNode]] : []),
        ]
      : []),
    [t("feedback.ctx.userAgent"), c.userAgent],
  ];
  return (
    <details className="group rounded-[16px] bg-background text-sm shadow-[0_3px_0_var(--chunky)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-[16px] px-4 py-3 font-heading font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        {t("feedback.context")}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>
      <div className="px-4 pb-3">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">{t("feedback.contextHint")}</p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-bold text-muted-foreground">{k}</dt>
              <dd className="font-semibold break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}
