import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { injectMeta, metaForPath, renderMetaBlock } from "./server/og/meta";
import { pickLang } from "./server/og/copy";

/**
 * Dev only: the per-path link-preview meta the production server injects (server/og). There
 * are no live battle rooms in this process, so battle links get the generic invite, and the
 * language follows `?lang=` only (the hook doesn't see request headers).
 */
const devLinkPreviewMeta = (): Plugin => ({
  name: "wr-link-preview-meta",
  apply: "serve",
  transformIndexHtml(html, ctx) {
    const url = new URL(ctx.originalUrl ?? ctx.path, "http://dev");
    const lang = pickLang(url.searchParams.get("lang"), null);
    const appUrl = process.env.APP_URL ?? `http://localhost:${process.env.VITE_PORT ?? 5173}`;
    return injectMeta(html, renderMetaBlock(metaForPath(url.pathname, { appUrl, lang }), lang));
  },
});

export default defineConfig({
  plugins: [
    devLinkPreviewMeta(),
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
        // logo-email.png is email-only; og/* are link-preview images for crawlers.
        globIgnores: ["**/*-ext-*.woff2", "brand/logo-email.png", "og/**"],
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
      "/og/battle": { target: process.env.API_URL ?? "http://localhost:3000" },
    },
  },
  build: { outDir: "dist" },
});
