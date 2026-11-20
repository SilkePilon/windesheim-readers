import { useTranslation } from "react-i18next";
import { ArrowUpRight, Container, GitFork, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Page } from "@/components/page";

const REPO = "https://github.com/SilkePilon/windesheim-readers";
const DEPLOY = `${REPO}#deploying`;
const MAKER = "https://github.com/SilkePilon";

function ExternalButton({ href, variant, children }: { href: string; variant: "chunky" | "chunky-surface"; children: string }) {
  return (
    <Button asChild variant={variant} size="xl" className="mt-4 w-full sm:w-auto">
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
        <ArrowUpRight />
      </a>
    </Button>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary [&_svg]:size-5">{icon}</span>
        <h2 className="font-heading text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

/** The page body without a shell, so it renders the same logged in or out (and tests need no app providers). */
export function AboutContent() {
  const { t } = useTranslation();
  return (
    <Page className="max-w-2xl">
      <header className="flex flex-col items-center py-4 text-center md:py-8">
        <img src="/brand/logo.svg" alt="" className="size-20 md:size-24" />
        <h1 className="mt-3 font-heading text-[26px] leading-tight font-semibold md:text-4xl">{t("app.name")}</h1>
        <p className="mt-2 max-w-md text-balance text-base font-bold text-muted-foreground md:text-lg">{t("about.hero")}</p>
      </header>

      <div className="flex flex-col gap-4">
        <Section icon={<Heart />} title={t("about.whyTitle")}>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{t("about.why")}</p>
        </Section>

        <Section icon={<GitFork />} title={t("about.openTitle")}>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{t("about.open")}</p>
          <ExternalButton href={REPO} variant="chunky">
            {t("about.openButton")}
          </ExternalButton>
        </Section>

        <Section icon={<Container />} title={t("about.hostTitle")}>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{t("about.host")}</p>
          <ExternalButton href={DEPLOY} variant="chunky-surface">
            {t("about.hostButton")}
          </ExternalButton>
        </Section>

        <Card className="flex-row items-center gap-4 p-5 md:p-6">
          <img
            src="/brand/maker.jpg"
            alt={t("about.makerPhotoAlt")}
            width={192}
            height={192}
            loading="lazy"
            className="size-20 shrink-0 rounded-full bg-track object-cover shadow-[0_4px_0_var(--chunky)] md:size-24"
          />
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t("about.makerTitle")}</p>
            <h2 className="font-heading text-xl font-semibold">Silke Pilon</h2>
            <p className="text-sm font-semibold text-muted-foreground">{t("about.makerRole")}</p>
            <a
              href={MAKER}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 rounded-md text-sm font-bold text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {t("about.makerLink")}
              <ArrowUpRight className="size-4" />
            </a>
          </div>
        </Card>
      </div>
    </Page>
  );
}
