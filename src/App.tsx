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
import StaffPortal from "./pages/StaffPortal.tsx";
import StaffRegister from "./pages/StaffRegister.tsx";

const queryClient = new QueryClient();

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
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/staff" element={<StaffPortal />} />
            <Route path="/staff/join/:token" element={<StaffRegister />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </DynamicIslandProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
