import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LIMITS, nicknameProblem, normalizeNickname } from "@shared/limits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CharCounter } from "@/components/char-counter";
import { api } from "@/lib/api";
import { errorText } from "@/lib/error-text";
import { notify } from "@/lib/notify";

export interface NicknameUser {
  id: string;
  name: string;
  nickname: string | null;
}

export function NicknameDialog({
  user,
  open,
  onOpenChange,
  onSaved,
}: {
  user: NicknameUser | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => Promise<unknown>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The form lives inside the content, so it remounts (fresh value) on every open. */}
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-sm">
        {user && <NicknameForm key={user.id} user={user} onOpenChange={onOpenChange} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

function NicknameForm({ user, onOpenChange, onSaved }: { user: NicknameUser; onOpenChange: (o: boolean) => void; onSaved: () => Promise<unknown> }) {
  const { t } = useTranslation();
  const current = user.nickname ?? "";
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);
  const invalid = nicknameProblem(value) !== null;
  const next = normalizeNickname(value);
  const dirty = next !== current;

  const submit = async (nickname: string | null) => {
    setSaving(true);
    try {
      await api.patch(`/admin/users/${user.id}`, { nickname });
      notify.success(t("admin.nickname.saved"));
      await onSaved();
      onOpenChange(false);
    } catch (e) {
      notify.error(errorText(e, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && !invalid && !saving) void submit(next || null);
      }}
    >
      <DialogHeader>
        <DialogTitle>{t("admin.nickname.title", { name: user.name })}</DialogTitle>
        <DialogDescription>{t("admin.nickname.hint")}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="admin-nick" className="text-sm font-bold">
            {t("profile.nickname")}
          </label>
          <CharCounter value={value} max={LIMITS.nickname.max} />
        </div>
        <Input
          id="admin-nick"
          value={value}
          maxLength={LIMITS.nickname.max}
          placeholder={user.name}
          autoComplete="off"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? "admin-nick-error" : undefined}
          onChange={(e) => setValue(e.target.value)}
        />
        {invalid && (
          <p id="admin-nick-error" role="alert" className="text-xs font-semibold text-danger-shade dark:text-danger">
            {t("profile.nicknameInvalid")}
          </p>
        )}
      </div>
      <DialogFooter>
        {user.nickname && (
          <Button type="button" variant="outline" disabled={saving} onClick={() => void submit(null)}>
            {t("admin.nickname.clear")}
          </Button>
        )}
        <Button type="submit" disabled={saving || invalid || !dirty}>
          {t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
