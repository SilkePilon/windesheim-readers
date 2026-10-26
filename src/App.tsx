import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import { useMe, useSavedLocale } from "@/lib/queries";
import { AppLayout } from "@/components/app-layout";
import { PageSpinner } from "@/components/page";
import LoginPage from "@/pages/login";
import HomePage from "@/pages/home";
import LessonPage from "@/pages/lesson";
import LessonStudyPage from "@/pages/lesson-study";
import ReviewPage from "@/pages/review";
import LeaderboardPage from "@/pages/leaderboard";
import ProfilePage from "@/pages/profile";
import BattlePage from "@/pages/battle";
import { AdminLayout } from "@/pages/admin/layout";

const AdminReadersPage = lazy(() => import("@/pages/admin/readers"));
const AdminReaderPage = lazy(() => import("@/pages/admin/reader"));
const AdminLessonPage = lazy(() => import("@/pages/admin/lesson"));
const AdminSettingsPage = lazy(() => import("@/pages/admin/settings"));
const AdminUsersPage = lazy(() => import("@/pages/admin/users"));

function RequireAuth({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { data: me, isLoading } = useMe();
  const location = useLocation();
  if (isLoading) return <PageSpinner />;
  if (!me) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (admin && me.user.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  useSavedLocale();
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Full-screen study mode (cards, quiz, review session, battle play) renders here,
          outside AppLayout, so there is no dock or rail. Pages wrap themselves in
          <StudyShell>. Routes are added with their tasks. */}
      <Route
        element={
          <RequireAuth>
            <Outlet />
          </RequireAuth>
        }
      >
        <Route path="lesson/:id/cards" element={<LessonStudyPage mode="cards" />} />
        <Route path="lesson/:id/quiz" element={<LessonStudyPage mode="quiz" />} />
        <Route path="review" element={<ReviewPage />} />
        {/* Battle picks its shell itself: AppLayout to join or host, StudyShell once in a room. */}
        <Route path="battle" element={<BattlePage />} />
        <Route path="battle/:code" element={<BattlePage />} />
      </Route>
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="learn" element={<Navigate to="/" replace />} />
        <Route path="lesson/:id" element={<LessonPage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route
          path="admin/*"
          element={
            <RequireAuth admin>
              <AdminLayout>
                <Suspense fallback={<PageSpinner />}>
                  <Routes>
                    <Route index element={<AdminReadersPage />} />
                    <Route path="readers/:id" element={<AdminReaderPage />} />
                    <Route path="lessons/:id" element={<AdminLessonPage />} />
                    <Route path="settings" element={<AdminSettingsPage />} />
                    <Route path="users" element={<AdminUsersPage />} />
                  </Routes>
                </Suspense>
              </AdminLayout>
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
