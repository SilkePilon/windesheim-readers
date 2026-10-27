import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { notify } from "@/lib/notify";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageSpinner } from "@/components/page";
import { PlayerAvatar } from "@/components/game/player-avatar";
import { Pill } from "@/components/admin/status-pill";
import { api } from "@/lib/api";
import { useMe } from "@/lib/queries";

interface UserRow {
  id: string;
  email: string;
  name: string;
  nickname: string | null;
  role: "user" | "admin";
  createdAt: string;
  xp: number | null;
  streak: number | null;
  envAdmin: boolean;
}

export default function AdminUsersPage() {
  const { t, i18n } = useTranslation();
  const { data: me } = useMe();
  const [saving, setSaving] = useState<string | null>(null);
  const { data, isLoading, refetch } = useQuery({ queryKey: ["admin", "users"], queryFn: () => api.get<UserRow[]>("/admin/users") });
  if (isLoading || !data) return <PageSpinner />;

  const setRole = async (id: string, role: "user" | "admin") => {
    setSaving(id);
    try {
      await api.patch(`/admin/users/${id}`, { role });
      await refetch();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setSaving(null);
    }
  };

  const head = "text-xs font-bold text-muted-foreground";
  return (
    <>
      <p className="mb-3 text-muted-foreground">{t("admin.usersCount", { count: data.length })}</p>
      <Card variant="flat" className="py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={`pl-4 ${head}`}>{t("admin.usersTable.name")}</TableHead>
              <TableHead className={`text-right ${head}`}>XP</TableHead>
              <TableHead className={`hidden sm:table-cell ${head}`}>{t("admin.usersTable.joined")}</TableHead>
              <TableHead className={`pr-4 ${head}`}>{t("admin.usersTable.role")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((u) => {
              const display = u.nickname || u.name || u.email;
              const isMe = u.id === me?.user.id;
              const admin = u.role === "admin" || u.envAdmin;
              return (
                <TableRow key={u.id}>
                  <TableCell className="w-full max-w-0 pl-4">
                    <div className="flex items-center gap-2.5">
                      <PlayerAvatar name={display} className="size-7 text-xs" />
                      <div className="min-w-0">
                        <div className="truncate font-bold">
                          {display}
                          {isMe && <span className="ml-1.5 text-xs font-semibold text-muted-foreground">({t("home.you")})</span>}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-heading font-semibold tabular-nums">{u.xp ?? 0}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{new Date(u.createdAt).toLocaleDateString(i18n.language)}</TableCell>
                  <TableCell className="pr-4">
                    {u.envAdmin ? (
                      <Pill tone="track" dot={false} title={t("admin.usersTable.envAdminHint")} aria-label={t("admin.usersTable.envAdmin")}>
                        <Lock />
                        <span className="sm:hidden">{t("admin.roles.admin")}</span>
                        <span className="hidden sm:inline">{t("admin.usersTable.envAdmin")}</span>
                      </Pill>
                    ) : (
                      <label className="flex items-center gap-2 whitespace-nowrap">
                        <Switch
                          checked={admin}
                          disabled={isMe || saving === u.id}
                          onCheckedChange={(v) => setRole(u.id, v ? "admin" : "user")}
                          aria-label={t("admin.usersTable.adminToggle", { name: display })}
                        />
                        <span className={admin ? "font-bold" : "text-muted-foreground"}>{t(`admin.roles.${u.role}`)}</span>
                      </label>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
