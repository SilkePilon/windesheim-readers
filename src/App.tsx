import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import { useMe, useSavedLocale } from "@/lib/queries";
import { AppLayout } from "@/components/app-layout";
import { PageSpinner } from "@/components/page";
import { FeedbackHost } from "@/components/feedback/feedback-host";
import LoginPage from "@/pages/login";
import HomePage from "@/pages/home";
import { PAGE_LOADERS } from "@/lib/warm-up";
import { AdminLayout } from "@/pages/admin/layout";

const LessonPage = lazy(PAGE_LOADERS.lesson);
const LessonStudyPage = lazy(PAGE_LOADERS.study);
const ReviewPage = lazy(PAGE_LOADERS.review);
const LeaderboardPage = lazy(PAGE_LOADERS.leaderboard);
const ProfilePage = lazy(PAGE_LOADERS.profile);
const BattlePage = lazy(PAGE_LOADERS.battle);
const ReaderLearnPage = lazy(PAGE_LOADERS.readerLearn);
const ReaderEpisodePage = lazy(PAGE_LOADERS.readerEpisode);
const ReaderSessionPage = lazy(PAGE_LOADERS.readerSession);
const AboutPage = lazy(() => import("@/pages/about"));
const AdminReadersPage = lazy(() => import("@/pages/admin/readers"));
const AdminReaderPage = lazy(() => import("@/pages/admin/reader"));
const AdminLessonPage = lazy(() => import("@/pages/admin/lesson"));
const AdminSettingsPage = lazy(() => import("@/pages/admin/settings"));
const AdminUsersPage = lazy(() => import("@/pages/admin/users"));
const AdminFeedbackPage = lazy(() => import("@/pages/admin/feedback"));
// Dev-only art gallery; the import is dropped from production builds.
const DevWorldPage = import.meta.env.DEV ? lazy(() => import("@/pages/dev-world")) : null;

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
    <>
      {/* Opened with openFeedback() from the help button or an error; one per app, logged in only. */}
      <FeedbackHost />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* Public: renders its own shell (app shell when logged in, standalone otherwise). */}
        <Route
          path="/about"
          element={
            <Suspense fallback={<PageSpinner />}>
              <AboutPage />
            </Suspense>
          }
        />
        {DevWorldPage && (
          <Route
            path="/dev/world"
            element={
              <Suspense fallback={<PageSpinner />}>
                <DevWorldPage />
              </Suspense>
            }
          />
        )}
        {/* Full-screen study mode (cards, quiz, review session, battle play) renders here,
            outside AppLayout, so there is no dock or rail. Pages wrap themselves in
            <StudyShell>. Routes are added with their tasks. */}
        <Route
          element={
            <RequireAuth>
              <Suspense fallback={<PageSpinner />}>
                <Outlet />
              </Suspense>
            </RequireAuth>
          }
        >
          <Route path="lesson/:id/cards" element={<LessonStudyPage mode="cards" />} />
          <Route path="lesson/:id/quiz" element={<LessonStudyPage mode="quiz" />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="reader/:id/session" element={<ReaderSessionPage />} />
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
          <Route path="reader/:id" element={<ReaderLearnPage />} />
          <Route path="reader/:id/episode/:week" element={<ReaderEpisodePage />} />
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
                      <Route path="feedback" element={<AdminFeedbackPage />} />
                    </Routes>
                  </Suspense>
                </AdminLayout>
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}
