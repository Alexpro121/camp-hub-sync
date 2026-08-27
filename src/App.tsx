import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DynamicIslandProvider } from "@/context/DynamicIslandContext";
import DynamicIsland from "@/components/ui/DynamicIsland";
import Index from "./pages/Index.tsx";
import StageMaintenance from "./pages/StageMaintenance.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <DynamicIslandProvider>
          <DynamicIsland />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/stage-console" element={<StageMaintenance />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </DynamicIslandProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
