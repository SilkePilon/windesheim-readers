import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Page, PageHeader, PageSpinner } from "@/components/page";
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
  const { data, isLoading, refetch } = useQuery({ queryKey: ["admin", "users"], queryFn: () => api.get<UserRow[]>("/admin/users") });
  if (isLoading || !data) return <PageSpinner />;

  const setRole = async (id: string, role: "user" | "admin") => {
    await api.patch(`/admin/users/${id}`, { role });
    await refetch();
  };

  return (
    <Page wide>
      <PageHeader title={t("admin.users")} description={`${data.length}`} />
      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">{t("admin.usersTable.email")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("admin.usersTable.name")}</TableHead>
                <TableHead>XP</TableHead>
                <TableHead className="hidden md:table-cell">{t("admin.usersTable.joined")}</TableHead>
                <TableHead>{t("admin.usersTable.role")}</TableHead>
                <TableHead className="pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="max-w-48 truncate pl-4">{u.email}</TableCell>
                  <TableCell className="hidden md:table-cell">{u.nickname || u.name}</TableCell>
                  <TableCell className="tabular-nums">{u.xp ?? 0}</TableCell>
                  <TableCell className="hidden md:table-cell">{new Date(u.createdAt).toLocaleDateString(i18n.language)}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === "admin" ? "default" : "secondary"}>{t(`admin.roles.${u.role}`)}</Badge>
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    {u.envAdmin ? (
                      <span className="text-xs text-muted-foreground">{t("admin.usersTable.envAdmin")}</span>
                    ) : (
                      u.id !== me?.user.id && (
                        <Button size="sm" variant="outline" onClick={() => setRole(u.id, u.role === "admin" ? "user" : "admin")}>
                          {u.role === "admin" ? t("admin.usersTable.makeUser") : t("admin.usersTable.makeAdmin")}
                        </Button>
                      )
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Page>
  );
}
