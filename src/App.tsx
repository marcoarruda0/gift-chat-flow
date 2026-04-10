import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Index";
import Contatos from "@/pages/Contatos";
import Conversas from "@/pages/Conversas";
import GiftbackConfig from "@/pages/GiftbackConfig";
import GiftbackCaixa from "@/pages/GiftbackCaixa";
import Placeholder from "@/pages/Placeholder";
import Fluxos from "@/pages/Fluxos";
import FluxoEditor from "@/pages/FluxoEditor";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><p className="text-muted-foreground">Carregando...</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/contatos" element={<ProtectedRoute><Contatos /></ProtectedRoute>} />
      <Route path="/conversas" element={<ProtectedRoute><Placeholder title="Conversas" /></ProtectedRoute>} />
      <Route path="/fluxos" element={<ProtectedRoute><Fluxos /></ProtectedRoute>} />
      <Route path="/fluxos/:id" element={<ProtectedRoute><FluxoEditor /></ProtectedRoute>} />
      <Route path="/disparos" element={<ProtectedRoute><Placeholder title="Disparos" /></ProtectedRoute>} />
      <Route path="/disparos" element={<ProtectedRoute><Placeholder title="Disparos" /></ProtectedRoute>} />
      <Route path="/giftback" element={<ProtectedRoute><GiftbackConfig /></ProtectedRoute>} />
      <Route path="/giftback/caixa" element={<ProtectedRoute><GiftbackCaixa /></ProtectedRoute>} />
      <Route path="/conhecimento" element={<ProtectedRoute><Placeholder title="Base de Conhecimento" /></ProtectedRoute>} />
      <Route path="/configuracoes" element={<ProtectedRoute><Placeholder title="Configurações" /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><Placeholder title="Admin Master" /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
