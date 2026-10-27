import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { notify } from "@/lib/notify";
import { api } from "@/lib/api";

/** POST /retry and tell the admin what it did. Shared by the grid and the reader page. */
export function useRetryReader() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const retry = async (id: string) => {
    setPending(id);
    try {
      const { action } = await api.post<{ action: "extract" | "generate" | "none" }>(`/admin/readers/${id}/retry`);
      if (action === "none") notify.info(t("admin.retryStarted.none"));
      else notify.success(t(`admin.retryStarted.${action}`));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "readers"] }),
        qc.invalidateQueries({ queryKey: ["admin", "reader", id] }),
      ]);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setPending(null);
    }
  };
  return { retry, pending };
}
