import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, ScrollRestoration, createBrowserRouter } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import "@fontsource/fredoka/600.css";
import "@fontsource/fredoka/700.css";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import i18n, { ensureLocale } from "@/lib/i18n";
import "./index.css";
import { App } from "./App";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { captureInstallPrompt } from "@/lib/install";
import { installPageTransitions } from "@/lib/motion";
import { queryClient } from "@/lib/query-client";
import { clearStaleChunkFlag, reloadOnceForStaleChunk } from "@/lib/warm-up";
import { CrashScreen } from "@/components/crash-screen";

// Before React mounts, so an early `beforeinstallprompt` is kept for the install drawer.
captureInstallPrompt();

// A new service worker activates immediately (skipWaiting + clientsClaim). Reload once
// when it takes over, so this page doesn't keep old JS that asks for deleted chunks.
// Skipped on the very first install (no previous controller); the flag prevents loops.
if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

// A lazy chunk that 404s after a deploy: reload once to get the new build. The flag is
// cleared 10 s after a healthy start so a later deploy can reload again.
window.addEventListener("vite:preloadError", (e) => {
  try {
    if (reloadOnceForStaleChunk(sessionStorage, () => location.reload())) e.preventDefault();
  } catch {
    // sessionStorage unavailable: let the error surface.
  }
});
setTimeout(() => {
  try {
    clearStaleChunkFlag(sessionStorage);
  } catch {
    // ignore
  }
}, 10_000);

// A data router (one catch-all route; App keeps its declarative <Routes>) so pages can
// use `useBlocker`, e.g. the admin structure editor's unsaved-changes guard.
// <ScrollRestoration>: a new page (push/replace) starts at the top, back/forward restores
// where you were (keyed per history entry; keyed by pathname, a push to a page visited
// before would restore its old position). It scrolls in a layout effect, so inside a
// page transition the new page is captured at its new scroll position.
const router = createBrowserRouter([
  {
    path: "*",
    // A render or loader crash lands here instead of react-router's default screen.
    errorElement: <CrashScreen />,
    element: (
      <>
        <ScrollRestoration />
        <App />
      </>
    ),
  },
]);
// Every navigation is a view transition (content slides, dock/rail stay put).
installPageTransitions(router);

// next-themes renders an inline <script> meant for SSR; in this client-only app it never
// runs, and React 19 logs "Encountered a script tag while rendering React component".
// Marking it as a data block silences that; the pre-paint theme script lives in index.html.
const THEME_SCRIPT_PROPS = { type: "application/json" } as const;

const start = () =>
  createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange scriptProps={THEME_SCRIPT_PROPS}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);

// The first paint waits for the English strings when the language starts as English; if
// that fails, render anyway (Dutch fallback) rather than block forever.
ensureLocale(i18n.language as "nl" | "en").then(start, start);
