import { QueryClient } from "@tanstack/react-query";

/** The app's one query client; a module so non-React code (e.g. `notifyError`) can read the cache. */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
