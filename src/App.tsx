import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import Index from "./pages/Index";
import DailyPage from "./pages/DailyPage";
import TradersPage from "./pages/TradersPage";
import TraderDetailPage from "./pages/TraderDetailPage";
import AnalysisPage from "./pages/AnalysisPage";
import ICPage from "./pages/ICPage";
import DiscrepanciesPage from "./pages/DiscrepanciesPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Index />} />
            <Route path="/daily" element={<DailyPage />} />
            <Route path="/traders" element={<TradersPage />} />
            <Route path="/traders/:traderId" element={<TraderDetailPage />} />
            <Route path="/analysis" element={<AnalysisPage />} />
            <Route path="/ic" element={<ICPage />} />
            <Route path="/discrepancies" element={<DiscrepanciesPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
