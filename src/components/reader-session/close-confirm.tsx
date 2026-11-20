import { useTranslation } from "react-i18next";
import { DoorOpen } from "lucide-react";
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

/** The ✕ during an unfinished reader session: rated cards stay saved, quiz XP needs the finish. */
export function SessionCloseConfirm({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const k = "readerLearn.session.closeConfirm";
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="gap-5 rounded-[24px] bg-card p-5 text-card-foreground shadow-[0_6px_0_var(--chunky)] ring-0 data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-sm">
        <AlertDialogHeader className="place-items-center text-center sm:group-data-[size=default]/alert-dialog-content:place-items-center sm:group-data-[size=default]/alert-dialog-content:text-center">
          <AlertDialogMedia className="mb-1 size-14 rounded-[18px] bg-danger text-danger-foreground shadow-[0_4px_0_var(--danger-shade)] sm:group-data-[size=default]/alert-dialog-content:row-span-1 *:[svg:not([class*='size-'])]:size-7">
            <DoorOpen strokeWidth={2.5} />
          </AlertDialogMedia>
          <AlertDialogTitle className="font-heading text-2xl font-semibold sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-1">
            {t(`${k}.title`)}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[15px] font-semibold text-muted-foreground">{t(`${k}.body`)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mx-0 mb-0 grid grid-cols-2 gap-3 rounded-none border-0 bg-transparent p-0 sm:flex-none">
          <AlertDialogCancel variant="chunky-surface" size="xl" className="w-full">
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
