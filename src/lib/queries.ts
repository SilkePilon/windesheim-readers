import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import type { LessonDetail, Me, ReaderWithLessons } from "./types";

export const qk = {
  me: ["me"] as const,
  readers: ["readers"] as const,
  lesson: (id: string) => ["lesson", id] as const,
  leaderboard: (p: string) => ["leaderboard", p] as const,
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

export function useReaders() {
  return useQuery({ queryKey: qk.readers, queryFn: () => api.get<ReaderWithLessons[]>("/readers") });
}

export function useLesson(id: string) {
  return useQuery({ queryKey: qk.lesson(id), queryFn: () => api.get<LessonDetail>(`/lessons/${id}`) });
}

/** Refresh everything that depends on XP / progress. */
export function useInvalidateProgress() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.me });
    void qc.invalidateQueries({ queryKey: qk.readers });
    void qc.invalidateQueries({ queryKey: ["lesson"] });
  };
}
