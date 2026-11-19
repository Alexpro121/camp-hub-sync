import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      filename: "sw.js",
      devOptions: { enabled: false },
      manifest: {
        name: "Залізна Зміна",
        short_name: "Залізна Зміна",
        description: "Всеукраїнський проєкт «Залізна Зміна» — Супровід, Учасник, Адміністратор",
        theme_color: "#07090E",
        background_color: "#07090E",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "/favicon.ico", sizes: "48x48", type: "image/x-icon" }],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        // Ярмарок і потяг вимкнені: їхній код не вантажимо в кеш телефонів
        globIgnores: ["**/{ChildCoupeCard,ChildFairCard,SupervisorFairView,CoupeManager,CoupeSwapSettings,TrainPublishStatus,TrainTab,AdminTrainView,AdminPrintQRCodes,FairHowTo,ApplePayScannerModal,useTrainSettings,useAggressiveFairUnlock}-*.js"],
        // Сторінку при запуску завжди беремо з мережі (свіжа версія після кожного деплою, зокрема в Telegram);
        // збережена копія — лише запасний варіант без інтернету. Раніше збережений index.html віддавався першим,
        // і після оновлення застосунок відкривався у старій версії.
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html-nav",
              networkTimeoutSeconds: 5,
              matchOptions: { ignoreSearch: true },
              // Немає мережі і ця сторінка ще не потрапила в html-nav (перше відкриття після встановлення):
              // віддаємо index.html з precache цієї ж версії, щоб відкрився збережений на пристрої профіль.
              plugins: [{
                handlerDidError: async () => (await caches.match("/index.html", { ignoreSearch: true })) ?? undefined,
              }],
            },
          },
          {
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin && ["style", "script", "font", "image"].includes(request.destination),
            handler: "CacheFirst",
            options: {
              cacheName: "static-assets",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
