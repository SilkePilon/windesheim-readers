import { useTranslation } from "react-i18next";
import { DoorOpen, Flag } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * The battle ✕: the host ends the battle for everyone, a player leaves it. Rendered on
 * the dark stage (the dialog portals out, so it carries the stage tokens itself).
 */
export function CloseConfirm({
  open,
  onOpenChange,
  isHost,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isHost: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const k = isHost ? "battle.endConfirm" : "battle.leaveConfirm";
  const Icon = isHost ? Flag : DoorOpen;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="dark stage gap-5 rounded-[24px] bg-card p-5 text-card-foreground shadow-[0_6px_0_var(--chunky)] ring-0 data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-sm">
        <AlertDialogHeader className="place-items-center text-center sm:group-data-[size=default]/alert-dialog-content:place-items-center sm:group-data-[size=default]/alert-dialog-content:text-center">
          <AlertDialogMedia className="mb-1 size-14 rounded-[18px] bg-danger text-danger-foreground shadow-[0_4px_0_var(--danger-shade)] sm:group-data-[size=default]/alert-dialog-content:row-span-1 *:[svg:not([class*='size-'])]:size-7">
            <Icon strokeWidth={2.5} />
          </AlertDialogMedia>
          <AlertDialogTitle className="font-heading text-2xl font-semibold sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-1">
            {t(`${k}.title`)}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[15px] font-semibold text-muted-foreground">{t(`${k}.body`)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mx-0 mb-0 grid grid-cols-2 gap-3 rounded-none border-0 bg-transparent p-0 sm:flex-none">
          <AlertDialogCancel variant="chunky-surface" size="xl" className="w-full bg-white/15 [--shade:var(--chunky)]">
            {t(`${k}.cancel`)}
          </AlertDialogCancel>
          <AlertDialogAction variant="chunky-danger" size="xl" className="w-full" onClick={onConfirm}>
            {t(`${k}.confirm`)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
