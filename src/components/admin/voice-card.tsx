import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Headphones, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Notice } from "@/components/notice";
import { Equalizer } from "@/components/listen/equalizer";
import { ModelCombobox } from "@/components/admin/model-combobox";
import { api } from "@/lib/api";
import type { VoiceChoice, VoiceInfo, VoiceProviderId } from "@/lib/types";

const VOICE_PROVIDERS: { id: VoiceProviderId; name: string }[] = [
  { id: "google", name: "Google Gemini" },
  { id: "openai", name: "OpenAI" },
];

/** Mirrors server/ai/voices.ts: OpenAI `instructions` only exist on gpt-4o-mini-tts*. */
export const supportsInstructions = (c: Pick<VoiceChoice, "provider" | "model">) => c.provider === "google" || c.model.startsWith("gpt-4o-mini-tts");
export const voicesFor = (all: VoiceInfo[] | undefined, model: string) => (all ?? []).filter((v) => !v.modelPrefix || model.startsWith(v.modelPrefix));

/** Compare two voice choices the way the server stores them (blank instructions = unset). */
export const sameVoice = (a: VoiceChoice, b: VoiceChoice) =>
  a.provider === b.provider && a.model === b.model && a.voice === b.voice && (a.instructions ?? "").trim() === (b.instructions ?? "").trim();

/** Error body of the voice endpoints: `INVALID_VOICE` carries a readable message. */
export type VoiceError = { message: string; validVoices?: string[] };

export function useVoices() {
  return useQuery({
    queryKey: ["admin", "ai", "voices"],
    queryFn: () => api.get<Record<VoiceProviderId, VoiceInfo[]>>("/admin/settings/ai/voices"),
    staleTime: Infinity,
  });
}

/**
 * The "Stem" (TTS) role card: provider, speech model, a voice valid for that model,
 * optional voice direction, and "Probeer stem" that plays a short sample inline.
 */
export function VoiceCard({
  value,
  onChange,
  defaults,
  typedKey,
  checkedKey,
  error,
}: {
  value: VoiceChoice;
  onChange: (v: VoiceChoice) => void;
  defaults: Record<VoiceProviderId, VoiceChoice>;
  typedKey?: string;
  checkedKey?: string;
  /** A save rejected with INVALID_VOICE. */
  error?: VoiceError | null;
}) {
  const { t, i18n } = useTranslation();
  const { data: catalogue } = useVoices();
  const valid = voicesFor(catalogue?.[value.provider], value.model);
  const known = catalogue?.[value.provider].find((v) => v.id === value.voice);
  const mismatch = !!catalogue && !valid.some((v) => v.id === value.voice);

  // Sample playback: the last fetched sample is kept for its exact choice so replaying is free.
  const audio = useRef<HTMLAudioElement | null>(null);
  const cache = useRef<{ key: string; url: string } | null>(null);
  const [sample, setSample] = useState<"idle" | "loading" | "playing">("idle");
  const [sampleError, setSampleError] = useState<{ for: string; error: VoiceError } | null>(null);
  const choiceKey = JSON.stringify([value.provider, value.model, value.voice, (value.instructions ?? "").trim()]);

  // Async steps bail out when the card unmounted or the choice changed meanwhile.
  const mounted = useRef(true);
  const currentKey = useRef(choiceKey);
  currentKey.current = choiceKey;
  const fetching = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      fetching.current?.abort();
      const el = audio.current;
      if (el) {
        el.onended = el.onpause = null;
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
      if (cache.current) URL.revokeObjectURL(cache.current.url);
      cache.current = null;
    };
  }, []);
  // A different choice stops the old sample (and a sample still loading for it).
  useEffect(() => {
    fetching.current?.abort();
    audio.current?.pause();
    setSample("idle");
  }, [choiceKey]);

  const play = async () => {
    if (sample === "playing") {
      audio.current?.pause();
      setSample("idle");
      return;
    }
    setSampleError(null);
    const key = choiceKey;
    let url = cache.current?.key === key ? cache.current.url : null;
    const stale = () => !mounted.current || currentKey.current !== key;
    if (!url) {
      setSample("loading");
      const ctrl = new AbortController();
      fetching.current = ctrl;
      try {
        const res = await fetch("/api/admin/settings/ai/voice/sample", {
          signal: ctrl.signal,
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...value,
            instructions: value.instructions?.trim() || undefined,
            apiKey: typedKey || undefined,
            language: i18n.language.startsWith("en") ? "en" : "nl",
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string; validVoices?: string[] };
          // Provider errors come as readable text; a bare code (or none) gets the generic message.
          const text = body.message ?? (body.error && !/^[A-Z0-9_]+$/.test(body.error) ? body.error : t("common.error"));
          throw { message: text, validVoices: body.validVoices } satisfies VoiceError;
        }
        const blob = await res.blob();
        if (stale()) return;
        url = URL.createObjectURL(blob);
        if (cache.current) URL.revokeObjectURL(cache.current.url);
        cache.current = { key, url };
      } catch (e) {
        if (stale()) return;
        setSample("idle");
        const err = e instanceof Error ? { message: e instanceof TypeError ? t("common.error") : e.message } : (e as VoiceError);
        setSampleError({ for: key, error: err });
        return;
      }
    }
    audio.current ??= new Audio();
    const el = audio.current;
    el.onended = () => setSample("idle");
    el.onpause = () => setSample("idle");
    el.src = url;
    try {
      await el.play();
      if (stale()) {
        el.pause();
        return;
      }
      setSample("playing");
    } catch (e) {
      if (stale()) return;
      setSample("idle");
      setSampleError({ for: key, error: { message: e instanceof Error ? e.message : String(e) } });
    }
  };

  const shownError = error ?? (sampleError?.for === choiceKey ? sampleError.error : null);
  const pickVoice = (voice: string) => onChange({ ...value, voice });

  return (
    <Card variant="flat">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">{t("admin.ai.voice")}</CardTitle>
        <CardDescription className="text-xs">{t("admin.ai.voiceHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="voice-provider">{t("admin.ai.provider")}</FieldLabel>
            <Select value={value.provider} onValueChange={(p) => onChange({ ...defaults[p as VoiceProviderId], instructions: value.instructions })}>
              <SelectTrigger id="voice-provider" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOICE_PROVIDERS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="voice-model">{t("admin.ai.model")}</FieldLabel>
            <ModelCombobox
              id="voice-model"
              kind="speech"
              provider={value.provider}
              apiKey={checkedKey}
              value={value.model}
              onChange={(model) => {
                // Keep the voice if the new model can use it, else take the model's first (recommended) voice.
                const ok = voicesFor(catalogue?.[value.provider], model);
                const voice = !catalogue || ok.some((v) => v.id === value.voice) ? value.voice : (ok[0]?.id ?? value.voice);
                onChange({ ...value, model, voice });
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="voice-voice">{t("admin.ai.voiceName")}</FieldLabel>
            <Select value={value.voice} onValueChange={pickVoice}>
              <SelectTrigger id="voice-voice" className="w-full" aria-invalid={mismatch || undefined}>
                <SelectValue>
                  <span className="font-semibold">{value.voice}</span>
                  {known && <span className="text-muted-foreground"> · {known.style}</span>}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {valid.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    <span className="font-semibold">{v.id}</span>
                    <span className="text-muted-foreground">{v.style}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {mismatch && <FieldDescription className="text-xs text-danger-shade dark:text-danger">{t("admin.ai.voiceMismatch", { voice: value.voice })}</FieldDescription>}
          </Field>
          {supportsInstructions(value) && (
            <Field>
              <FieldLabel htmlFor="voice-instructions">{t("admin.ai.voiceInstructions")}</FieldLabel>
              <Textarea
                id="voice-instructions"
                value={value.instructions ?? ""}
                maxLength={1000}
                placeholder={t("admin.ai.voiceInstructionsPlaceholder")}
                onChange={(e) => onChange({ ...value, instructions: e.target.value })}
                className="min-h-20 text-sm"
              />
              <FieldDescription className="text-xs">{t("admin.ai.voiceInstructionsHint")}</FieldDescription>
            </Field>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="flat" disabled={sample === "loading" || !value.model || !value.voice} onClick={play} aria-pressed={sample === "playing"}>
              {sample === "loading" ? <Spinner /> : sample === "playing" ? <Square className="fill-current" /> : <Headphones />}
              {sample === "playing" ? t("admin.ai.stopSample") : t("admin.ai.trySample")}
            </Button>
            {sample === "playing" && <Equalizer playing className="h-4 text-primary" />}
            {sample === "loading" && <span className="text-xs text-muted-foreground">{t("admin.ai.sampleLoading")}</span>}
          </div>
          {shownError && (
            <Notice
              variant="flat"
              tone="danger"
              title={error ? t("admin.ai.voiceInvalid") : t("admin.ai.sampleFailed")}
              description={
                <span className="flex flex-col gap-2">
                  <span title={shownError.message} className="line-clamp-4">
                    {shownError.message}
                  </span>
                  {!!shownError.validVoices?.length && (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span>{t("admin.ai.validVoices")}</span>
                      {shownError.validVoices.slice(0, 6).map((v) => (
                        <Button key={v} size="xs" variant="flat" onClick={() => pickVoice(v)}>
                          {v}
                        </Button>
                      ))}
                    </span>
                  )}
                </span>
              }
            />
          )}
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
