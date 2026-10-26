import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Service worker (production build only; disabled in `vite` dev). The manifest stays
    // in public/manifest.webmanifest, linked once from index.html, so the plugin doesn't
    // generate or inject its own.
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "script-defer",
      manifest: false,
      workbox: {
        // App shell: html, js, css, latin fonts (all the UI needs) and the brand assets.
        globPatterns: ["**/*.{html,js,css,svg,png,ico,webmanifest}", "**/*-latin-*.woff2"],
        globIgnores: ["**/*-ext-*.woff2", "brand/logo-email.png"], // email-only asset
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        // "script-defer" registration doesn't turn these on by itself: without them a new
        // build waits until every tab / the installed app is closed. main.tsx reloads once
        // on controllerchange so open pages pick up the new shell.
        skipWaiting: true,
        clientsClaim: true,
        // API responses are never cached: data stays fresh and auth isn't stored.
        runtimeCaching: [{ urlPattern: ({ url }) => url.pathname.startsWith("/api/"), handler: "NetworkOnly" }],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  server: {
    port: Number(process.env.VITE_PORT ?? 5173),
    proxy: {
      "/api": { target: process.env.API_URL ?? "http://localhost:3000", ws: true },
    },
  },
  build: { outDir: "dist" },
});
