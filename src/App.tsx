import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "./components/layout/AppLayout";
import Index from "./pages/Index";
import DailyPage from "./pages/DailyPage";
import TradersPage from "./pages/TradersPage";
import TraderDetailPage from "./pages/TraderDetailPage";
import AssetDetailPage from "./pages/AssetDetailPage";
import AnalysisPage from "./pages/AnalysisPage";
import ICPage from "./pages/ICPage";
import DiscrepanciesPage from "./pages/DiscrepanciesPage";
import AuthPage from "./pages/AuthPage";
import AdminSyncPage from "./pages/AdminSyncPage";
import TemplatesPage from "./pages/TemplatesPage";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Index />} />
        <Route path="/daily" element={<DailyPage />} />
        <Route path="/traders" element={<TradersPage />} />
        <Route path="/traders/:traderId" element={<TraderDetailPage />} />
        <Route path="/assets/:assetId" element={<AssetDetailPage />} />
        <Route path="/analysis" element={<AnalysisPage />} />
        <Route path="/ic" element={<ICPage />} />
        <Route path="/discrepancies" element={<DiscrepanciesPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/admin" element={<AdminSyncPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
