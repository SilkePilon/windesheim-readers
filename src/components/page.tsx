import type { ReactNode } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/notice";
import { cn } from "@/lib/utils";

export function Page({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <div className={cn("mx-auto w-full px-4 py-4 md:px-8 md:py-8", wide ? "max-w-6xl" : "max-w-3xl", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  back,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  back?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start gap-3 md:mb-8">
      {back && (
        <Button variant="ghost" size="icon" asChild className="-ml-2 shrink-0">
          <Link to={back}>
            <ChevronLeft />
          </Link>
        </Button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground md:text-base">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A page whose data didn't load: a notice with a retry. */
export function PageError({ title, onRetry, retrying }: { title?: string; onRetry: () => void; retrying?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[50dvh] items-center justify-center px-4">
      <Notice
        className="w-full max-w-md"
        title={title ?? t("common.error")}
        description={t("common.errorHint")}
        action={
          <Button variant="chunky" size="lg" onClick={onRetry} disabled={retrying}>
            {retrying && <Spinner />} {t("common.retry")}
          </Button>
        }
      />
    </div>
  );
}

export function PageSpinner() {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}
