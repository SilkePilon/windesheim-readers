import { useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ExternalLink, KeyRound, Trash2, TriangleAlert, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageSpinner } from "@/components/page";
import { Pill } from "@/components/admin/status-pill";
import { SaveBar } from "@/components/admin/save-bar";
import { ModelCombobox, keyFingerprint, useModels } from "@/components/admin/model-combobox";
import { api } from "@/lib/api";
import type { AiSettings, KeyValidation, ModelChoice, ProviderId } from "@/lib/types";

const PROVIDERS: { id: ProviderId; name: string; url: string }[] = [
  {
    id: "google",
    name: "Google Gemini",
    url: "https://aistudio.google.com/apikey",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    url: "https://console.anthropic.com/settings/keys",
  },
  { id: "openai", name: "OpenAI", url: "https://platform.openai.com/api-keys" },
  { id: "openrouter", name: "OpenRouter", url: "https://openrouter.ai/keys" },
];
const providerName = (id: ProviderId) => PROVIDERS.find((p) => p.id === id)!.name;

type Role = "generation" | "fast";
type Keys = Partial<Record<ProviderId, string>>;
type TestResult = { ok: boolean; reply?: string; ms?: number; error?: string };

const SETTINGS_KEY = ["admin", "ai"];
const sameChoice = (a: ModelChoice, b: ModelChoice) => a.provider === b.provider && a.model === b.model;

function RoleCard({
  role,
  value,
  onChange,
  defaults,
  typedKey,
  checkedKey,
}: {
  role: Role;
  value: ModelChoice;
  onChange: (v: ModelChoice) => void;
  defaults: AiSettings["defaults"];
  /** The key typed for this provider right now (sent with Test). */
  typedKey?: string;
  /** The typed key after the validation debounce (used for the model list). */
  checkedKey?: string;
}) {
  const { t } = useTranslation();
  const [test, setTest] = useState<{
    for: ModelChoice;
    result: TestResult;
  } | null>(null);
  const [testing, setTesting] = useState(false);
  const { data: models } = useModels(value.provider, checkedKey);
  const info = models?.find((m) => m.id === value.model);
  // Only a result for the current choice is shown; changing provider or model hides it.
  const result = test && sameChoice(test.for, value) ? test.result : null;

  const runTest = async () => {
    const choice = value;
    setTesting(true);
    setTest(null);
    try {
      const r = await api.post<TestResult>("/admin/settings/ai/test", {
        ...choice,
        apiKey: typedKey || undefined,
      });
      setTest({ for: choice, result: r });
    } catch (e) {
      setTest({
        for: choice,
        result: {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        },
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card variant="flat">
      <CardHeader>
        <CardTitle>{t(`admin.ai.${role}`)}</CardTitle>
        <CardDescription className="text-xs">{t(`admin.ai.${role}Hint`)}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor={`${role}-provider`}>{t("admin.ai.provider")}</FieldLabel>
            <Select
              value={value.provider}
              onValueChange={(p) =>
                onChange({
                  provider: p as ProviderId,
                  model: defaults[p as ProviderId],
                })
              }
            >
              <SelectTrigger id={`${role}-provider`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${role}-model`}>{t("admin.ai.model")}</FieldLabel>
            <ModelCombobox
              id={`${role}-model`}
              provider={value.provider}
              apiKey={checkedKey}
              value={value.model}
              onChange={(model) => onChange({ ...value, model })}
            />
            {role === "generation" && info?.structuredOutput === false && (
              <p className="flex items-start gap-1.5 text-xs text-warning-shade dark:text-warning">
                <TriangleAlert className="mt-px size-3.5 shrink-0" />
                <span>{t("admin.ai.noStructured")}</span>
              </p>
            )}
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="flat" disabled={testing || !value.model} onClick={runTest}>
              {testing ? <Spinner /> : <Zap />} {t("admin.ai.test")}
            </Button>
            {result?.ok && <Pill tone="success">{t("admin.ai.testOk", { ms: result.ms })}</Pill>}
          </div>
          {result && !result.ok && (
            <p
              role="alert"
              title={result.error}
              className="-mt-2 line-clamp-4 rounded-md bg-danger/10 px-2.5 py-2 text-xs break-words text-danger-shade dark:text-danger"
            >
              {t("admin.ai.testFail", { error: result.error })}
            </p>
          )}
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

export default function AdminSettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => api.get<AiSettings>("/admin/settings/ai"),
  });
  // Unsaved edits: role choices only exist here once changed; typed keys until saved.
  const [draft, setDraft] = useState<Partial<Record<Role, ModelChoice>>>({});
  const [typed, setTyped] = useState<Keys>({});
  const [checked, setChecked] = useState<Keys>({});
  const [saving, setSaving] = useState(false);
  const [confirmInvalid, setConfirmInvalid] = useState<ProviderId[] | null>(null);

  // Typed keys are validated 600ms after the last keystroke.
  useEffect(() => {
    const h = setTimeout(() => setChecked(typed), 600);
    return () => clearTimeout(h);
  }, [typed]);

  const key = (p: ProviderId) => typed[p]?.trim() ?? "";
  const checkedKey = (p: ProviderId) => checked[p]?.trim() || undefined;

  // One free list call per provider: the typed key if any, else the saved/.env key.
  const validations = useQueries({
    queries: PROVIDERS.map((p) => {
      const k = checkedKey(p.id);
      const saved = data?.keys[p.id];
      return {
        queryKey: ["admin", "ai", "validate", p.id, k ? keyFingerprint(k) : "saved"],
        queryFn: () =>
          api.post<KeyValidation>("/admin/settings/ai/validate", {
            provider: p.id,
            apiKey: k,
          }),
        enabled: !!k || !!saved?.stored || !!saved?.env,
        staleTime: 5 * 60_000,
        retry: false,
      };
    }),
  });

  const current = (role: Role) => draft[role] ?? data![role];
  const rolesDirty = !!data && (["generation", "fast"] as const).some((r) => draft[r] && !sameChoice(draft[r]!, data[r]));
  const keysDirty = PROVIDERS.some((p) => key(p.id) !== "");
  const dirty = rolesDirty || keysDirty;

  // Guard unsaved edits on in-app navigation and reload, like the structure editor.
  const leaving = useRef(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      if (leaving.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  if (isLoading || !data) return <PageSpinner />;

  const put = async (body: { generation?: ModelChoice; fast?: ModelChoice; keys?: Partial<Record<ProviderId, string | null>> }) => {
    const res = await api.put<AiSettings>("/admin/settings/ai", body);
    qc.setQueryData(SETTINGS_KEY, res);
    // Saved keys changed: re-check them and reload model lists that used the saved key.
    await qc.invalidateQueries({
      predicate: (q) => q.queryKey[0] === "admin" && q.queryKey[1] === "ai" && q.queryKey.length > 2,
    });
  };

  const validationFor = (p: ProviderId) => validations[PROVIDERS.findIndex((x) => x.id === p)];

  const save = async (force = false) => {
    const keys: Partial<Record<ProviderId, string>> = {};
    for (const p of PROVIDERS) if (key(p.id)) keys[p.id] = key(p.id);
    // Keys whose last validation (of exactly this value) said invalid need a confirmation.
    const invalid = PROVIDERS.filter((p) => {
      if (!keys[p.id] || checkedKey(p.id) !== keys[p.id]) return false;
      const v = validationFor(p.id).data;
      return v && !v.ok && v.invalid;
    }).map((p) => p.id);
    if (invalid.length && !force) {
      setConfirmInvalid(invalid);
      return;
    }
    setSaving(true);
    try {
      await put({
        generation: current("generation"),
        fast: current("fast"),
        keys: Object.keys(keys).length ? keys : undefined,
      });
      setDraft({});
      setTyped({});
      setChecked({});
      toast.success(t("common.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  const removeKey = async (p: ProviderId) => {
    try {
      await put({ keys: { [p]: null } });
      toast.success(t("common.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  const reset = () => {
    setDraft({});
    setTyped({});
    setChecked({});
  };

  const keyPill = (p: ProviderId) => {
    const saved = data.keys[p];
    const v = validationFor(p);
    if (key(p)) {
      if (checkedKey(p) !== key(p) || v.isFetching || !v.data)
        return (
          <Pill tone="busy" spin>
            {t("admin.ai.validating")}
          </Pill>
        );
      if (v.data.ok) return <Pill tone="success">{t("admin.ai.keyValid", { count: v.data.modelCount })}</Pill>;
      if (v.data.invalid) return <Pill tone="danger">{t("admin.ai.keyInvalid")}</Pill>;
      return (
        <Pill tone="warning" title={v.data.error} className="max-w-48 sm:max-w-64">
          <span className="truncate">{v.data.error}</span>
        </Pill>
      );
    }
    if (!saved.stored && !saved.env) return <Pill tone="track">{t("admin.ai.keyMissing")}</Pill>;
    if (v.data && !v.data.ok && v.data.invalid) return <Pill tone="danger">{t("admin.ai.keyInvalid")}</Pill>;
    return <Pill tone="success">{saved.stored ? t("admin.ai.keySet") : t("admin.ai.keyEnv")}</Pill>;
  };

  return (
    <>
      <p className="mb-4 text-muted-foreground">{t("admin.ai.intro")}</p>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="grid gap-4">
          {(["generation", "fast"] as const).map((role) => {
            const value = current(role);
            return (
              <RoleCard
                key={role}
                role={role}
                value={value}
                onChange={(v) => setDraft((d) => ({ ...d, [role]: v }))}
                defaults={data.defaults}
                typedKey={key(value.provider) || undefined}
                checkedKey={checkedKey(value.provider)}
              />
            );
          })}
        </div>

        <Card variant="flat">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-muted-foreground" /> {t("admin.ai.keys")}
            </CardTitle>
            <CardDescription className="text-xs">{t("admin.ai.keysHint")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {PROVIDERS.map((p) => {
              const saved = data.keys[p.id];
              return (
                <Field key={p.id} className="gap-1.5">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="flex shrink-0 items-center gap-1.5">
                      <FieldLabel htmlFor={`key-${p.id}`}>{p.name}</FieldLabel>
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                        aria-label={`${p.name}: API key`}
                        title={`${p.name}: API key`}
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    </span>
                    {keyPill(p.id)}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      id={`key-${p.id}`}
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={saved.stored ? "••••••••••••" : t("admin.ai.keyPlaceholder")}
                      value={typed[p.id] ?? ""}
                      onChange={(e) => setTyped((s) => ({ ...s, [p.id]: e.target.value }))}
                      className="font-mono placeholder:font-sans"
                    />
                    {saved.stored && (
                      <Button variant="flat" size="icon" title={t("admin.ai.removeKey")} aria-label={t("admin.ai.removeKey")} onClick={() => removeKey(p.id)}>
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </Field>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Room for the save bar so it never covers the last card. */}
      {dirty && <div aria-hidden className="h-24" />}
      <SaveBar dirty={dirty} saving={saving} onSave={() => save()} onReset={reset} />

      <AlertDialog open={!!confirmInvalid} onOpenChange={(o) => !o && setConfirmInvalid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.ai.saveInvalidTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("admin.ai.saveInvalidConfirm", {
                providers: confirmInvalid?.map(providerName).join(", "),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmInvalid(null);
                void save(true);
              }}
            >
              {t("admin.ai.saveAnyway")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={blocker.state === "blocked"} onOpenChange={(o) => !o && blocker.reset?.()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.leaveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("admin.ai.leaveText")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>{t("admin.leaveStay")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                leaving.current = true;
                blocker.proceed?.();
              }}
            >
              {t("admin.leaveDiscard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
