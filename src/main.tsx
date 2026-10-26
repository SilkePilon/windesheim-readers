import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import "@fontsource/fredoka/600.css";
import "@fontsource/fredoka/700.css";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "@/lib/i18n";
import "./index.css";
import { App } from "./App";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { captureInstallPrompt } from "@/lib/install";

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

// A data router (one catch-all route; App keeps its declarative <Routes>) so pages can
// use `useBlocker`, e.g. the admin structure editor's unsaved-changes guard.
const router = createBrowserRouter([{ path: "*", element: <App /> }]);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

// next-themes renders an inline <script> meant for SSR; in this client-only app it never
// runs, and React 19 logs "Encountered a script tag while rendering React component".
// Marking it as a data block silences that; the pre-paint theme script lives in index.html.
const THEME_SCRIPT_PROPS = { type: "application/json" } as const;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange scriptProps={THEME_SCRIPT_PROPS}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster position="top-center" richColors />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
