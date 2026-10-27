import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import { setLocale } from "./i18n";
import type { BadgeStatus, Leaderboard, LessonAudio, LessonDetail, Me, ReaderWithLessons } from "./types";

export const qk = {
  me: ["me"] as const,
  readers: ["readers"] as const,
  lesson: (id: string) => ["lesson", id] as const,
  lessonAudio: (id: string) => ["lesson", id, "audio"] as const,
  leaderboard: (p: string) => ["leaderboard", p] as const,
  badges: ["me", "badges"] as const,
};

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: async () => {
      try {
        return await api.get<Me>("/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 30_000,
  });
}

/** Once logged in, the UI follows the saved user locale; a null locale (never chosen) keeps the device/browser language. */
export function useSavedLocale() {
  const { data: me } = useMe();
  const locale = me?.user.locale;
  useEffect(() => {
    if (locale) setLocale(locale);
  }, [locale]);
}

export function useReaders() {
  return useQuery({ queryKey: qk.readers, queryFn: () => api.get<ReaderWithLessons[]>("/readers") });
}

export function useLesson(id: string) {
  return useQuery({ queryKey: qk.lesson(id), queryFn: () => api.get<LessonDetail>(`/lessons/${id}`) });
}

/** Luisterles status, chapters and resume position (never any text). Polls while it is being made. */
export function useLessonAudio(id: string, opts: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: qk.lessonAudio(id),
    queryFn: () => api.get<LessonAudio>(`/lessons/${id}/audio`),
    refetchInterval: (q) => (opts.poll && q.state.data?.status === "generating" ? 3000 : false),
  });
}

/** Every badge with earnedAt / progress (GET /me/badges). Under the "me" key, so progress invalidation refreshes it. */
export function useBadges() {
  return useQuery({ queryKey: qk.badges, queryFn: () => api.get<BadgeStatus[]>("/me/badges") });
}

export function useLeaderboard(period: "week" | "all") {
  return useQuery({ queryKey: qk.leaderboard(period), queryFn: () => api.get<Leaderboard>(`/leaderboard?period=${period}`) });
}

/** Refresh everything that depends on XP / progress. */
export function useInvalidateProgress() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.me });
    void qc.invalidateQueries({ queryKey: qk.readers });
    void qc.invalidateQueries({ queryKey: ["lesson"] });
    void qc.invalidateQueries({ queryKey: ["leaderboard"] });
  };
}
