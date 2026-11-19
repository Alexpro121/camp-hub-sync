import { lazyRetry } from '@/lib/lazyRetry';
import { lazy, Suspense, type ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DynamicIslandProvider } from "@/context/DynamicIslandContext";
import DynamicIsland from "@/components/ui/DynamicIsland";
import SyncStatusPill from "@/components/ui/SyncStatusPill";
import AppUpdatePrompt from "@/components/ui/AppUpdatePrompt";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import { FullScreenLoader } from "@/components/ui/loader";
import AppErrorBoundary from "@/components/AppErrorBoundary";
import TelegramGate from "@/components/telegram/TelegramGate";
import { isTelegramMiniApp } from "@/lib/telegramAuth";

/** Сторінки, яких у Telegram-боті немає: реєстрація супроводу там — лише за посиланням від адміна. */
const WebOnly = ({ children, text }: { children: ReactElement; text: string }) =>
  isTelegramMiniApp() ? <TelegramGate state="unlinked" text={text} /> : children;

const StaffPortal = lazyRetry(() => import("./pages/StaffPortal.tsx"));
const Registry = lazyRetry(() => import("./pages/Registry.tsx"));
const StaffRegister = lazyRetry(() => import("./pages/StaffRegister.tsx"));

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 2, refetchOnWindowFocus: false } } });

// Підвантажуємо кабінет супроводу у вільний час, щоб він відкривався миттєво.
if (typeof window !== "undefined") {
  const idle = (window as any).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 2000));
  idle(() => { import("./pages/StaffPortal.tsx").catch(() => {}); });
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <DynamicIslandProvider>
          <DynamicIsland />
          <SyncStatusPill />
          <AppUpdatePrompt />
          <AppErrorBoundary><Suspense fallback={<FullScreenLoader label="Завантаження..." />}><Routes>
            <Route path="/" element={<Index />} />
            <Route path="/staff" element={<StaffPortal />} />
            <Route path="/staff/join/:token" element={<WebOnly text="У боті реєстрація супроводу — за посиланням від адміністратора."><StaffRegister /></WebOnly>} />
            <Route path="/registry" element={<Registry />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes></Suspense></AppErrorBoundary>
        </DynamicIslandProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
