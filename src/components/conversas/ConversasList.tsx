import { useState } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConversaItem } from "./ConversaItem";
import { Search, MessageSquarePlus, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Conversa {
  id: string;
  contato_nome: string;
  contato_avatar?: string | null;
  ultimo_texto: string | null;
  ultima_msg_at: string | null;
  nao_lidas: number;
  status: string;
  aguardando_humano?: boolean;
  marcada_nao_lida?: boolean;
  atendente_id?: string | null;
  departamento_id?: string | null;
}

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
}

const FILTROS = ["Todas", "Abertas", "Minhas", "Meu Depto", "Fechadas"] as const;

export function ConversasList({ conversas, selectedId, onSelect, onNewConversa, onSync, onImport, syncing, loading, currentUserId, userDepartamentoId }: ConversasListProps) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<typeof FILTROS[number]>("Todas");

  const filtered = conversas.filter(c => {
    if (busca && !c.contato_nome.toLowerCase().includes(busca.toLowerCase())) return false;
    if (filtro === "Abertas") return c.status === "aberta";
    if (filtro === "Minhas") return c.atendente_id === currentUserId;
    if (filtro === "Meu Depto") return userDepartamentoId && c.departamento_id === userDepartamentoId;
    if (filtro === "Fechadas") return c.status === "fechada";
    return true;
  });

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
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversa..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex gap-1">
          {FILTROS.map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                filtro === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma conversa encontrada
          </div>
        ) : (
          filtered.map(c => (
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
              selected={selectedId === c.id}
              onClick={() => onSelect(c.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
