import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { ConversaItem } from "./ConversaItem";
import { Search, MessageSquarePlus, RefreshCw, Upload, MessageSquare, BadgeCheck, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Conversa {
  id: string;
  contato_nome: string;
  contato_telefone?: string | null;
  contato_avatar?: string | null;
  ultimo_texto: string | null;
  ultima_msg_at: string | null;
  nao_lidas: number;
  status: string;
  aguardando_humano?: boolean;
  marcada_nao_lida?: boolean;
  atendente_id?: string | null;
  departamento_id?: string | null;
  created_at?: string | null;
  canal?: string | null;
  fixada?: boolean;
}

type CanalTab = "todos" | "zapi" | "whatsapp_cloud";
type TipoTab = "individual" | "grupos";
const CANAL_STORAGE_KEY = "conversas_canal_tab";
const TIPO_STORAGE_KEY = "conversas_tipo_tab";

interface ConversasListProps {
  conversas: Conversa[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewConversa?: () => void;
  onSync?: () => void;
  onImport?: () => void;
  syncing?: boolean;
  loading: boolean;
  currentUserId?: string | null;
  userDepartamentoId?: string | null;
  isAdmin?: boolean;
}

const BASE_FILTROS = ["Todas", "Abertas", "Minhas", "Meu Depto", "Fechadas"] as const;
const ADMIN_FILTROS = [...BASE_FILTROS, "Sem Atendente"] as const;

type Filtro = (typeof ADMIN_FILTROS)[number];

const isGrupo = (c: Conversa) => (c.contato_telefone || "").includes("@g.us");
const isCloud = (c: Conversa) => c.canal === "whatsapp_cloud";
const isZapi = (c: Conversa) => !isCloud(c);

export function ConversasList({ conversas, selectedId, onSelect, onNewConversa, onSync, onImport, syncing, loading, currentUserId, userDepartamentoId, isAdmin }: ConversasListProps) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("Todas");
  const [canalTab, setCanalTab] = useState<CanalTab>(() => {
    if (typeof window === "undefined") return "todos";
    const saved = window.localStorage.getItem(CANAL_STORAGE_KEY) as CanalTab | null;
    return saved === "zapi" || saved === "whatsapp_cloud" || saved === "todos" ? saved : "todos";
  });
  const [tipoTab, setTipoTab] = useState<TipoTab>(() => {
    if (typeof window === "undefined") return "individual";
    const saved = window.localStorage.getItem(TIPO_STORAGE_KEY) as TipoTab | null;
    return saved === "grupos" || saved === "individual" ? saved : "individual";
  });

  useEffect(() => {
    try { window.localStorage.setItem(CANAL_STORAGE_KEY, canalTab); } catch {}
  }, [canalTab]);
  useEffect(() => {
    try { window.localStorage.setItem(TIPO_STORAGE_KEY, tipoTab); } catch {}
  }, [tipoTab]);

  const filtros = isAdmin ? ADMIN_FILTROS : BASE_FILTROS;

  // Contadores por tipo (sobre toda a lista)
  const tipoCounts = useMemo(() => ({
    individual: conversas.filter(c => !isGrupo(c)).length,
    grupos: conversas.filter(isGrupo).length,
  }), [conversas]);

  // Lista filtrada apenas por tipo (base para canal counts)
  const porTipo = useMemo(
    () => conversas.filter(c => tipoTab === "grupos" ? isGrupo(c) : !isGrupo(c)),
    [conversas, tipoTab]
  );

  // Contadores por canal (dentro do tipo selecionado)
  const counts = useMemo(() => ({
    todos: porTipo.length,
    zapi: porTipo.filter(isZapi).length,
    whatsapp_cloud: porTipo.filter(isCloud).length,
  }), [porTipo]);

  // Lista filtrada por tipo + canal + busca (base para filter chip counts)
  const baseFiltered = useMemo(() => {
    return porTipo.filter(c => {
      if (canalTab === "zapi" && isCloud(c)) return false;
      if (canalTab === "whatsapp_cloud" && !isCloud(c)) return false;
      if (busca && !c.contato_nome.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    });
  }, [porTipo, canalTab, busca]);

  const filtroCounts = useMemo(() => {
    const counts: Record<Filtro, number> = {
      "Todas": 0, "Abertas": 0, "Minhas": 0, "Meu Depto": 0, "Fechadas": 0, "Sem Atendente": 0,
    };
    for (const c of baseFiltered) {
      counts["Todas"]++;
      if (c.status === "aberta") counts["Abertas"]++;
      if (c.atendente_id === currentUserId) counts["Minhas"]++;
      if (userDepartamentoId && c.departamento_id === userDepartamentoId) counts["Meu Depto"]++;
      if (c.status === "fechada") counts["Fechadas"]++;
      if (c.status === "aberta" && !c.atendente_id) counts["Sem Atendente"]++;
    }
    return counts;
  }, [baseFiltered, currentUserId, userDepartamentoId]);

  const filtered = baseFiltered.filter(c => {
    if (filtro === "Abertas") return c.status === "aberta";
    if (filtro === "Minhas") return c.atendente_id === currentUserId;
    if (filtro === "Meu Depto") return userDepartamentoId && c.departamento_id === userDepartamentoId;
    if (filtro === "Fechadas") return c.status === "fechada";
    if (filtro === "Sem Atendente") return c.status === "aberta" && !c.atendente_id;
    return true;
  });

  // Conversas fixadas no topo, mantendo ordem original (já vem por ultima_msg_at desc)
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const af = a.fixada ? 1 : 0;
      const bf = b.fixada ? 1 : 0;
      return bf - af;
    });
  }, [filtered]);

  const tipoTabs: { id: TipoTab; label: string; icon: typeof User; count: number }[] = [
    { id: "individual", label: "Individual", icon: User, count: tipoCounts.individual },
    { id: "grupos", label: "Grupos", icon: Users, count: tipoCounts.grupos },
  ];

  const canalTabs: { id: CanalTab; label: string; icon: typeof MessageSquare; count: number }[] = [
    { id: "todos", label: "Todos", icon: MessageSquare, count: counts.todos },
    { id: "zapi", label: "Z-API", icon: MessageSquare, count: counts.zapi },
    { id: "whatsapp_cloud", label: "Oficial", icon: BadgeCheck, count: counts.whatsapp_cloud },
  ];

  return (
    <div className="flex flex-col h-full border-r border-border bg-card">
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Conversas</h2>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onSync} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onImport} title="Importar histórico">
              <Upload className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onNewConversa}>
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {/* Tabs de tipo: separa Individual e Grupos */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-muted">
          {tipoTabs.map(t => {
            const Icon = t.icon;
            const active = tipoTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTipoTab(t.id)}
                className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-sm text-xs font-medium transition-colors ${
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={t.label}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="truncate">{t.label}</span>
                <span className={`text-[10px] px-1 rounded ${active ? "bg-muted text-muted-foreground" : "bg-background/60"}`}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
        {/* Tabs de canal: separa Z-API e WhatsApp Oficial */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-md bg-muted">
          {canalTabs.map(t => {
            const Icon = t.icon;
            const active = canalTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setCanalTab(t.id)}
                className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-sm text-xs font-medium transition-colors ${
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={t.label}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="truncate">{t.label}</span>
                <span className={`text-[10px] px-1 rounded ${active ? "bg-muted text-muted-foreground" : "bg-background/60"}`}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversa..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {filtros.map(f => {
            const active = filtro === f;
            const count = filtroCounts[f];
            return (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors inline-flex items-center gap-1 ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                <span>{f}</span>
                <span className={`text-[10px] ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : sorted.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma conversa encontrada
          </div>
        ) : (
          sorted.map(c => (
            <ConversaItem
              key={c.id}
              id={c.id}
              nomeContato={c.contato_nome}
              avatarUrl={c.contato_avatar}
              ultimoTexto={c.ultimo_texto}
              ultimaMsgAt={c.ultima_msg_at}
              naoLidas={c.nao_lidas}
              status={c.status}
              aguardandoHumano={c.aguardando_humano}
              marcadaNaoLida={c.marcada_nao_lida}
              atendenteId={c.atendente_id}
              createdAt={c.created_at}
              fixada={c.fixada}
              selected={selectedId === c.id}
              onClick={() => onSelect(c.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
