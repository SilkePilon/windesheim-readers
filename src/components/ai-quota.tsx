import { useTranslation } from "react-i18next";
import { Notice } from "@/components/notice";
import { cn } from "@/lib/utils";
import type { AiFeature, AiQuota } from "@/lib/types";

/** "Nog 3 beoordelingen vandaag": a quiet counter, only once `remaining` is at most `showAt`. */
export function AiQuotaHint({ feature, quota, showAt, className }: { feature: AiFeature; quota: AiQuota | null; showAt: number; className?: string }) {
  const { t } = useTranslation();
  if (!quota || quota.remaining === 0 || quota.remaining > showAt) return null;
  return (
    <span aria-live="polite" className={cn("shrink-0 text-[11px] font-bold text-foreground/70 tabular-nums", className)}>
      {t(`aiQuota.${feature}.left`, { count: quota.remaining })}
    </span>
  );
}

/** The friendly "you've used today's …, carry on tomorrow" notice. */
export function AiLimitNotice({ feature, variant, className }: { feature: AiFeature; variant?: "chunky" | "inset"; className?: string }) {
  const { t } = useTranslation();
  return <Notice tone="info" variant={variant} title={t(`aiQuota.${feature}.title`)} description={t(`aiQuota.${feature}.text`)} className={className} />;
}
