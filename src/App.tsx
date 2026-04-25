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
import Configuracoes from "@/pages/Configuracoes";
import Campanhas from "@/pages/Campanhas";
import Fluxos from "@/pages/Fluxos";
import FluxoEditor from "@/pages/FluxoEditor";
import ZapiConfig from "@/pages/ZapiConfig";
import WhatsappOficialConfig from "@/pages/WhatsappOficialConfig";
import WhatsappWebhookEventos from "@/pages/WhatsappWebhookEventos";
import Conhecimento from "@/pages/Conhecimento";
import IAConfig from "@/pages/IAConfig";
import Empresa from "@/pages/Empresa";
import PecaRara from "@/pages/PecaRara";
import RelatorioAtendimento from "@/pages/RelatorioAtendimento";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children, noPadding }: { children: React.ReactNode; noPadding?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><p className="text-muted-foreground">Carregando...</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout noPadding={noPadding}>{children}</AppLayout>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/contatos" element={<ProtectedRoute><Contatos /></ProtectedRoute>} />
      <Route path="/conversas" element={<ProtectedRoute noPadding><Conversas /></ProtectedRoute>} />
      <Route path="/fluxos" element={<ProtectedRoute><Fluxos /></ProtectedRoute>} />
      <Route path="/fluxos/:id" element={<ProtectedRoute><FluxoEditor /></ProtectedRoute>} />
      <Route path="/campanhas" element={<ProtectedRoute><Campanhas /></ProtectedRoute>} />
      <Route path="/disparos" element={<Navigate to="/campanhas" replace />} />
      <Route path="/giftback" element={<ProtectedRoute><GiftbackConfig /></ProtectedRoute>} />
      <Route path="/giftback/caixa" element={<ProtectedRoute><GiftbackCaixa /></ProtectedRoute>} />
      <Route path="/conhecimento" element={<ProtectedRoute><Conhecimento /></ProtectedRoute>} />
      <Route path="/configuracoes" element={<ProtectedRoute><Configuracoes /></ProtectedRoute>} />
      <Route path="/configuracoes/zapi" element={<ProtectedRoute><ZapiConfig /></ProtectedRoute>} />
      <Route path="/configuracoes/whatsapp-oficial" element={<ProtectedRoute><WhatsappOficialConfig /></ProtectedRoute>} />
      <Route path="/configuracoes/whatsapp-oficial/eventos" element={<ProtectedRoute><WhatsappWebhookEventos /></ProtectedRoute>} />
      <Route path="/configuracoes/ia" element={<ProtectedRoute><IAConfig /></ProtectedRoute>} />
      <Route path="/empresa" element={<ProtectedRoute><Empresa /></ProtectedRoute>} />
      <Route path="/empresas" element={<ProtectedRoute><Empresa initialTab="empresas" /></ProtectedRoute>} />
      <Route path="/peca-rara" element={<ProtectedRoute><PecaRara /></ProtectedRoute>} />
      <Route path="/relatorios/atendimento" element={<ProtectedRoute><RelatorioAtendimento /></ProtectedRoute>} />
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
