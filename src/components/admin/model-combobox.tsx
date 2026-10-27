import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronsUpDown, CornerDownLeft, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import type { ModelInfo, ProviderId } from "@/lib/types";
import { cn } from "@/lib/utils";

/** FNV-1a fingerprint, so a typed key never ends up verbatim in a query key. */
export function keyFingerprint(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

/** "1M ctx", "200K ctx". */
export function formatContext(n: number) {
  if (n >= 1_000_000) return `${Number((n / 1_000_000).toFixed(1))}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

/** "text": chat/generation models; "speech": the provider's TTS models (the "Stem" role). */
export type ModelKind = "text" | "speech";

const fetchModels = (provider: ProviderId, apiKey: string | undefined, refresh: boolean, kind: ModelKind) =>
  api.post<ModelInfo[]>(kind === "speech" ? "/admin/settings/ai/voice/models" : "/admin/settings/ai/models", {
    provider,
    apiKey: apiKey || undefined,
    refresh: refresh || undefined,
  });

/**
 * Live model list for a provider. Uses the typed (unsaved) key when given, otherwise the
 * server falls back to the stored or .env key. `refresh()` bypasses the server cache.
 */
export function useModels(provider: ProviderId, apiKey?: string, kind: ModelKind = "text") {
  const qc = useQueryClient();
  // Index 4 stays the key fingerprint ("saved" is invalidated after a save, see settings.tsx).
  const queryKey = ["admin", "ai", kind === "speech" ? "speech-models" : "models", provider, apiKey ? keyFingerprint(apiKey) : "saved"];
  const query = useQuery({
    queryKey,
    queryFn: () => fetchModels(provider, apiKey, false, kind),
    staleTime: 10 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await qc.fetchQuery({
        queryKey,
        queryFn: () => fetchModels(provider, apiKey, true, kind),
        staleTime: 0,
        retry: false,
      });
    } catch {
      // The query now carries the error; the combobox shows it inline.
    } finally {
      setRefreshing(false);
    }
  };
  return { ...query, refresh, refreshing };
}

/**
 * Searchable model picker filled from the provider's live list. Shows name, id and
 * context size; deprecated models get a muted tag. Any typed id can be used as-is, so
 * it keeps working when the list can't be loaded.
 */
export function ModelCombobox({
  id,
  provider,
  apiKey,
  value,
  onChange,
  kind = "text",
}: {
  id?: string;
  provider: ProviderId;
  apiKey?: string;
  value: string;
  onChange: (model: string) => void;
  kind?: ModelKind;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: models, isFetching, error, refresh, refreshing } = useModels(provider, apiKey, kind);

  // NO_API_KEY is the server's code for "no key saved or typed" (server/ai/models.ts).
  const errorText = !error ? "" : error.message === "NO_API_KEY" ? t("admin.ai.modelsNoKey") : t("admin.ai.modelsError", { error: error.message });
  const selected = models?.find((m) => m.id === value);
  const term = search.trim();
  const filtered = useMemo(() => {
    const q = term.toLowerCase();
    if (!models) return [];
    if (!q) return models;
    // An exact id match goes first, so Enter picks it rather than a longer id it prefixes.
    return models
      .filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.id === term) - Number(a.id === term));
  }, [models, term]);
  const offerCustom = term !== "" && !models?.some((m) => m.id === term);

  const pick = (model: string) => {
    onChange(model);
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) setSearch("");
        }}
      >
        {/* Anchored to the whole row so the list is as wide as trigger + refresh. */}
        <PopoverAnchor asChild>
          <div className="flex gap-2">
            <PopoverTrigger asChild>
              <Button
                id={id}
                variant="flat"
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={open}
                className="h-9 min-w-0 flex-1 justify-between gap-2 px-3 font-semibold"
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  {value ? (
                    selected && selected.name !== selected.id ? (
                      <>
                        <span className="truncate">{selected.name}</span>
                        <span className="hidden truncate font-mono text-xs font-normal text-muted-foreground sm:inline">{selected.id}</span>
                      </>
                    ) : (
                      <span className="truncate font-mono text-[13px]">{value}</span>
                    )
                  ) : (
                    <span className="text-muted-foreground">{t("admin.ai.chooseModel")}</span>
                  )}
                </span>
                <ChevronsUpDown className="text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <Button
              variant="flat"
              className="h-9 shrink-0"
              onClick={refresh}
              disabled={refreshing}
              aria-label={t("admin.ai.refresh")}
              title={t("admin.ai.refresh")}
            >
              <RefreshCw className={cn(refreshing && "animate-spin motion-reduce:animate-none")} />
              <span className="hidden sm:inline">{t("admin.ai.refresh")}</span>
            </Button>
          </div>
        </PopoverAnchor>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width) max-w-[calc(100vw-2rem)] p-0">
          <Command shouldFilter={false}>
            <CommandInput value={search} onValueChange={setSearch} placeholder={t("admin.ai.searchModel")} aria-label={t("admin.ai.searchModel")} />
            <CommandList label={t("admin.ai.model")}>
              {isFetching && !models ? (
                <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                  <Spinner /> {t("admin.ai.loadingModels")}
                </div>
              ) : error && !models ? (
                <p title={errorText} className="line-clamp-4 px-3 py-3 text-xs break-words text-danger-shade dark:text-danger">
                  {errorText}
                </p>
              ) : (
                !filtered.length && !offerCustom && <CommandEmpty>{t("admin.ai.noModels")}</CommandEmpty>
              )}
              {filtered.length > 0 && (
                <CommandGroup>
                  {filtered.map((m) => (
                    <CommandItem
                      key={m.id}
                      value={m.id}
                      data-checked={m.id === value}
                      aria-current={m.id === value || undefined}
                      onSelect={() => pick(m.id)}
                      className="items-start"
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className={cn("truncate font-semibold", m.deprecated && "text-muted-foreground")}>{m.name}</span>
                          {m.deprecated && (
                            <span className="shrink-0 rounded-full bg-track px-1.5 text-[11px] font-bold text-muted-foreground">
                              {t("admin.ai.deprecated")}
                            </span>
                          )}
                        </span>
                        <span className="truncate font-mono text-xs text-muted-foreground">{m.id}</span>
                        {m.id === value && <span className="sr-only">{t("admin.ai.selected")}</span>}
                      </span>
                      {m.contextWindow ? (
                        <span className="shrink-0 pt-0.5 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                          {formatContext(m.contextWindow)} ctx
                        </span>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {offerCustom && (
                <CommandGroup className={cn(filtered.length > 0 && "border-t")}>
                  <CommandItem value={`custom:${term}`} onSelect={() => pick(term)}>
                    <CornerDownLeft className="text-muted-foreground" />
                    <span className="min-w-0 truncate">{t("admin.ai.customModel", { id: term })}</span>
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && !open && (
        <p className="flex items-start gap-1.5 text-xs break-words text-danger-shade dark:text-danger">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          <span title={errorText} className="line-clamp-3 min-w-0">
            {errorText}
          </span>
        </p>
      )}
    </div>
  );
}
