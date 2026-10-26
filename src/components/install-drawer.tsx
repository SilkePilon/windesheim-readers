import { useEffect, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Share, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { installDismissedAt, shouldShowInstall, useInstall } from "@/lib/install";

/**
 * "Install the app" bottom drawer. Chromium gets an Install button wired to the captured
 * `beforeinstallprompt`; iOS Safari gets the two manual steps. Renders nothing (closed)
 * when the app is installed or the browser can't install it.
 */
export function InstallDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const { platform, promptInstall, dismiss } = useInstall();
  const installable = platform === "prompt" || platform === "ios-safari";

  const close = () => {
    dismiss();
    onOpenChange(false);
  };
  const install = async () => {
    const outcome = await promptInstall();
    if (outcome === "dismissed") dismiss();
    onOpenChange(false);
  };

  return (
    <Drawer open={open && installable} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DrawerContent className="mx-auto max-w-md rounded-t-[26px] border-0 bg-card pb-[calc(1rem+env(safe-area-inset-bottom))] data-[vaul-drawer-direction=bottom]:rounded-t-[26px] data-[vaul-drawer-direction=bottom]:border-t-0">
        <DrawerHeader className="items-center gap-2 px-6 pt-5 pb-2 text-center md:text-center">
          <img
            src="/brand/app-icon.svg"
            alt=""
            className="size-[72px] rounded-[20px] shadow-[0_5px_0_var(--primary-shade)]"
          />
          <DrawerTitle className="mt-2 font-heading text-[22px] leading-tight font-semibold text-balance">
            {t("install.title")}
          </DrawerTitle>
          <DrawerDescription className="text-[15px] font-semibold text-balance text-muted-foreground">
            {t("install.body")}
          </DrawerDescription>
        </DrawerHeader>

        {platform === "ios-safari" ? (
          <div className="flex flex-col gap-3 px-6 pt-3 pb-2">
            <ol className="flex flex-col gap-2.5">
              <Step n={1} icon={<Share className="size-5" strokeWidth={2.4} />}>
                <Trans i18nKey="install.stepShare" components={{ b: <b className="font-extrabold" /> }} />
              </Step>
              <Step n={2} icon={<SquarePlus className="size-5" strokeWidth={2.4} />}>
                <Trans i18nKey="install.stepAdd" components={{ b: <b className="font-extrabold" /> }} />
              </Step>
            </ol>
            <Button variant="chunky" size="xl" className="mt-2 w-full" onClick={close}>
              {t("install.gotIt")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 px-6 pt-3 pb-2">
            <Button variant="chunky" size="xl" className="w-full" onClick={() => void install()}>
              {t("install.install")}
            </Button>
            <Button variant="ghost" size="xl" className="w-full text-muted-foreground" onClick={close}>
              {t("install.notNow")}
            </Button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}

function Step({ n, icon, children }: { n: number; icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-[18px] bg-background px-3.5 py-3 text-[15px] font-semibold shadow-[0_4px_0_var(--chunky)]">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary font-heading text-base font-semibold text-primary-foreground">
        {n}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-card text-info shadow-[0_3px_0_var(--chunky)]">
        {icon}
      </span>
    </li>
  );
}

const SHOW_DELAY_MS = 1500;
const MOBILE_QUERY = "(max-width: 767.98px)"; // below Tailwind's md

/** Home page: offers the install drawer once, ~1.5s after mount, on mobile when installable. */
export function InstallNudge() {
  const { platform } = useInstall();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      const show = shouldShowInstall({
        platform,
        dismissedAt: installDismissedAt(),
        now: Date.now(),
        isMobile: window.matchMedia(MOBILE_QUERY).matches,
      });
      if (show) setOpen(true);
    }, SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [platform]);

  return <InstallDrawer open={open} onOpenChange={setOpen} />;
}
