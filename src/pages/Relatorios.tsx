import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RelatorioGiftback from "@/pages/RelatorioGiftback";
import RelatorioAtendimento from "@/pages/RelatorioAtendimento";
import RelatorioCRM from "@/components/relatorios/RelatorioCRM";

const TABS = ["giftback", "atendimento", "crm"] as const;
type TabKey = (typeof TABS)[number];

const STORAGE_KEY = "relatorios_tab";

export default function Relatorios() {
  const { hasRole, loading: authLoading } = useAuth();
  const isAdmin = hasRole("admin_tenant") || hasRole("admin_master");
  const [searchParams, setSearchParams] = useSearchParams();

  const initial: TabKey = (() => {
    const fromUrl = searchParams.get("tab");
    if (fromUrl && (TABS as readonly string[]).includes(fromUrl)) return fromUrl as TabKey;
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && (TABS as readonly string[]).includes(saved)) return saved as TabKey;
    }
    return "giftback";
  })();

  const [tab, setTab] = useState<TabKey>(initial);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, tab);
    }
    if (searchParams.get("tab") !== tab) {
      const next = new URLSearchParams(searchParams);
      next.set("tab", tab);
      setSearchParams(next, { replace: true });
    }
  }, [tab]);

  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Relatórios</h1>
        <p className="text-muted-foreground">
          Indicadores de Giftback, Atendimentos e CRM
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList>
          <TabsTrigger value="giftback">Giftback</TabsTrigger>
          <TabsTrigger value="atendimento">Atendimentos</TabsTrigger>
          <TabsTrigger value="crm">CRM</TabsTrigger>
        </TabsList>

        <TabsContent value="giftback" className="mt-6">
          <RelatorioGiftback embedded />
        </TabsContent>
        <TabsContent value="atendimento" className="mt-6">
          <RelatorioAtendimento embedded />
        </TabsContent>
        <TabsContent value="crm" className="mt-6">
          <RelatorioCRM />
        </TabsContent>
      </Tabs>
    </div>
  );
}
