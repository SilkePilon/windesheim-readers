import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckCircle2, KeyRound, Trash2, XCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Page, PageHeader, PageSpinner } from "@/components/page";
import { api } from "@/lib/api";
import type { AiSettings, ModelChoice, ProviderId } from "@/lib/types";

const PROVIDERS: { id: ProviderId; name: string; url: string }[] = [
  { id: "google", name: "Google Gemini", url: "https://aistudio.google.com/apikey" },
  { id: "anthropic", name: "Anthropic Claude", url: "https://console.anthropic.com/settings/keys" },
  { id: "openai", name: "OpenAI", url: "https://platform.openai.com/api-keys" },
  { id: "openrouter", name: "OpenRouter", url: "https://openrouter.ai/keys" },
];

function ModelPicker({
  role,
  value,
  onChange,
  defaults,
}: {
  role: "generation" | "fast";
  value: ModelChoice;
  onChange: (v: ModelChoice) => void;
  defaults: AiSettings["defaults"];
}) {
  const { t } = useTranslation();
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(`admin.ai.${role}`)}</CardTitle>
        <CardDescription>{t(`admin.ai.${role}Hint`)}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel>{t("admin.ai.provider")}</FieldLabel>
            <Select value={value.provider} onValueChange={(p) => onChange({ provider: p as ProviderId, model: defaults[p as ProviderId] })}>
              <SelectTrigger className="w-full">
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
            <Input id={`${role}-model`} value={value.model} onChange={(e) => onChange({ ...value, model: e.target.value })} className="font-mono" />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={testing || !value.model}
              onClick={async () => {
                setTesting(true);
                setTest(null);
                const r = await api.post<{ ok: boolean; ms?: number; error?: string }>("/admin/settings/ai/test", value);
                setTest({ ok: r.ok, text: r.ok ? t("admin.ai.testOk", { ms: r.ms }) : t("admin.ai.testFail", { error: r.error }) });
                setTesting(false);
              }}
            >
              {testing ? <Spinner /> : <Zap />} {t("admin.ai.test")}
            </Button>
            {test && (
              <span className={`flex items-center gap-1 text-sm ${test.ok ? "text-emerald-600" : "text-destructive"}`}>
                {test.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />} <span className="break-all">{test.text}</span>
              </span>
            )}
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

export default function AdminSettingsPage() {
  const { t } = useTranslation();
  const { data, isLoading, refetch } = useQuery({ queryKey: ["admin", "ai"], queryFn: () => api.get<AiSettings>("/admin/settings/ai") });
  const [generation, setGeneration] = useState<ModelChoice | null>(null);
  const [fast, setFast] = useState<ModelChoice | null>(null);
  const [keys, setKeys] = useState<Partial<Record<ProviderId, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setGeneration(data.generation);
      setFast(data.fast);
    }
  }, [data]);

  if (isLoading || !data || !generation || !fast) return <PageSpinner />;

  const save = async (extra?: Partial<Record<ProviderId, string | null>>) => {
    setSaving(true);
    try {
      await api.put("/admin/settings/ai", { generation, fast, keys: extra ?? keys });
      setKeys({});
      await refetch();
      toast.success(t("common.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page>
      <PageHeader title={t("admin.ai.title")} description={t("admin.ai.intro")} />
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-5" /> {t("admin.ai.keys")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {PROVIDERS.map((p) => {
              const k = data.keys[p.id];
              return (
                <Field key={p.id}>
                  <div className="flex items-center justify-between gap-2">
                    <FieldLabel htmlFor={`key-${p.id}`}>
                      <a href={p.url} target="_blank" rel="noreferrer" className="hover:underline">
                        {p.name}
                      </a>
                    </FieldLabel>
                    {k.stored ? (
                      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">{t("admin.ai.keySet")}</Badge>
                    ) : k.env ? (
                      <Badge variant="secondary">{t("admin.ai.keyEnv")}</Badge>
                    ) : (
                      <Badge variant="outline">{t("admin.ai.keyMissing")}</Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      id={`key-${p.id}`}
                      type="password"
                      autoComplete="off"
                      placeholder={k.stored ? "••••••••••••" : t("admin.ai.keyPlaceholder")}
                      value={keys[p.id] ?? ""}
                      onChange={(e) => setKeys((s) => ({ ...s, [p.id]: e.target.value }))}
                      className="font-mono"
                    />
                    {k.stored && (
                      <Button variant="ghost" size="icon" title={t("admin.ai.removeKey")} onClick={() => save({ [p.id]: null })}>
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </Field>
              );
            })}
          </CardContent>
        </Card>

        <ModelPicker role="generation" value={generation} onChange={setGeneration} defaults={data.defaults} />
        <ModelPicker role="fast" value={fast} onChange={setFast} defaults={data.defaults} />

        <div className="sticky bottom-20 flex justify-end md:bottom-4">
          <Button size="lg" onClick={() => save()} disabled={saving} className="shadow-lg">
            {saving && <Spinner />} {t("common.save")}
          </Button>
        </div>
      </div>
    </Page>
  );
}
