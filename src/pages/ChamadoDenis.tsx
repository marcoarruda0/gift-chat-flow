import { useEffect, useMemo, useState, useCallback, KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Trash2, Loader2, Settings, Link2, ExternalLink, Copy, CheckCircle2, RefreshCw, MapPin, PackageCheck, Package, ChevronDown, Printer, ShoppingCart } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ConfirmarEntregaDialog, EntregaPayload } from "@/components/vendas-online/ConfirmarEntregaDialog";
import { ComprovanteEntregaDialog } from "@/components/vendas-online/ComprovanteEntregaDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Item = {
  id: string;
  numero: number;
  descricao: string;
  valor: number;
  status: "disponivel" | "vendido";
  abacate_billing_id: string | null;
  abacate_url: string | null;
  abacate_status: string | null;
  pagador_nome: string | null;
  pagador_email: string | null;
  pagador_cel: string | null;
  pagador_tax_id: string | null;
  pago_em: string | null;
  forma_pagamento: string | null;
  local_id: string | null;
  entregue: boolean;
  entregue_em: string | null;
  entregue_para_proprio: boolean | null;
  entregue_para_nome: string | null;
  entregue_para_doc: string | null;
  entregue_assinatura: string | null;
};

type Local = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
};

type CellKey = `${string}-${"descricao" | "valor" | "status"}`;

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const SELECT_COLS =
  "id, numero, descricao, valor, status, abacate_billing_id, abacate_url, abacate_status, pagador_nome, pagador_email, pagador_cel, pagador_tax_id, pago_em, forma_pagamento, local_id, entregue, entregue_em, entregue_para_proprio, entregue_para_nome, entregue_para_doc, entregue_assinatura";

export default function ChamadoDenis() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "disponivel" | "vendido" | "pago" | "pendente" | "sem_link">("todos");
  const [editing, setEditing] = useState<CellKey | null>(null);
  const [draftValue, setDraftValue] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [locais, setLocais] = useState<Local[]>([]);
  const [novoLocalNome, setNovoLocalNome] = useState("");
  const [criandoLocal, setCriandoLocal] = useState(false);
  const [filtroLocal, setFiltroLocal] = useState<string>("todos");
  const [filtroEntrega, setFiltroEntrega] = useState<"todos" | "pendente" | "entregue">("todos");
  const [buscaVendidos, setBuscaVendidos] = useState("");
  const [entregaItem, setEntregaItem] = useState<Item | null>(null);
  const [desfazerItem, setDesfazerItem] = useState<Item | null>(null);
  const [verEntregaItem, setVerEntregaItem] = useState<Item | null>(null);
  const [openGroups, setOpenGroups] = useState<{ vendas: boolean; vendidos: boolean; locais: boolean }>(() => {
    try {
      const raw = localStorage.getItem("vendas-online:groups");
      if (raw) return { vendas: true, vendidos: true, locais: true, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return { vendas: true, vendidos: true, locais: true };
  });
  const toggleGroup = (k: "vendas" | "vendidos" | "locais") => setOpenGroups(prev => {
    const next = { ...prev, [k]: !prev[k] };
    try { localStorage.setItem("vendas-online:groups", JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });

  const loadLocais = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("vendas_online_locais")
      .select("id, nome, descricao, ativo")
      .eq("tenant_id", tenantId)
      .order("nome");
    setLocais((data || []) as Local[]);
  }, [tenantId]);

  useEffect(() => { loadLocais(); }, [loadLocais]);

  // Realtime locais
  useEffect(() => {
    if (!tenantId) return;
    const ch = supabase
      .channel("vendas-online-locais-" + tenantId)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "vendas_online_locais", filter: `tenant_id=eq.${tenantId}` },
        () => loadLocais()
      ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId, loadLocais]);

  const addLocal = async () => {
    const nome = novoLocalNome.trim();
    if (!nome || !tenantId) return;
    setCriandoLocal(true);
    const { error } = await supabase.from("vendas_online_locais").insert({ tenant_id: tenantId, nome });
    setCriandoLocal(false);
    if (error) { toast.error("Erro ao criar local"); return; }
    setNovoLocalNome("");
    toast.success("Local criado");
  };

  const updateLocal = async (id: string, patch: Partial<Local>) => {
    const { error } = await supabase.from("vendas_online_locais").update(patch).eq("id", id);
    if (error) toast.error("Erro ao atualizar local");
  };

  const removeLocal = async (id: string) => {
    if (!confirm("Excluir este local? Itens alocados ficarão sem local.")) return;
    const { error } = await supabase.from("vendas_online_locais").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir local");
  };

  const setItemLocal = async (item: Item, local_id: string | null) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, local_id } : i));
    const { error } = await supabase.from("chamado_denis_itens").update({ local_id }).eq("id", item.id);
    if (error) { toast.error("Erro ao alocar local"); load(); }
  };

  const logEntrega = async (
    item: Item,
    acao: "entregue" | "desfeito",
    payload?: EntregaPayload,
  ) => {
    if (!tenantId) return;
    await (supabase as any).from("chamado_denis_entregas_log").insert({
      tenant_id: tenantId,
      item_id: item.id,
      acao,
      usuario_id: profile?.id ?? null,
      usuario_nome: (profile as any)?.nome ?? (profile as any)?.email ?? null,
      retirante_proprio: payload ? payload.proprio : null,
      retirante_nome: payload ? payload.nome : null,
      retirante_doc: payload ? payload.doc : null,
      assinatura: payload ? payload.assinatura : null,
    });
  };

  const confirmarEntrega = async (item: Item, payload: EntregaPayload) => {
    const patch = {
      entregue: true,
      entregue_em: new Date().toISOString(),
      entregue_por: profile?.id ?? null,
      entregue_para_proprio: payload.proprio,
      entregue_para_nome: payload.nome,
      entregue_para_doc: payload.doc,
      entregue_assinatura: payload.assinatura,
    };
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...patch } : i));
    const { error } = await supabase.from("chamado_denis_itens").update(patch).eq("id", item.id);
    if (error) { toast.error("Erro ao confirmar entrega"); load(); }
    else { toast.success("Entrega confirmada"); logEntrega(item, "entregue", payload); }
  };

  const desfazerEntrega = async (item: Item) => {
    const patch = {
      entregue: false,
      entregue_em: null,
      entregue_por: null,
      entregue_para_proprio: null,
      entregue_para_nome: null,
      entregue_para_doc: null,
      entregue_assinatura: null,
    };
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...patch } : i));
    const { error } = await supabase.from("chamado_denis_itens").update(patch).eq("id", item.id);
    if (error) { toast.error("Erro ao desfazer entrega"); load(); }
    else { toast.success("Entrega desfeita"); logEntrega(item, "desfeito"); }
  };

  const vendidos = useMemo(() => {
    return items.filter(i => {
      const isVend = i.status === "vendido" || i.abacate_status === "PAID";
      if (!isVend) return false;
      if (filtroLocal === "sem_local" && i.local_id) return false;
      if (filtroLocal !== "todos" && filtroLocal !== "sem_local" && i.local_id !== filtroLocal) return false;
      if (filtroEntrega === "pendente" && i.entregue) return false;
      if (filtroEntrega === "entregue" && !i.entregue) return false;
      if (buscaVendidos) {
        const q = buscaVendidos.toLowerCase();
        const hit =
          (i.descricao || "").toLowerCase().includes(q) ||
          (i.pagador_nome || "").toLowerCase().includes(q) ||
          (i.pagador_tax_id || "").toLowerCase().includes(q) ||
          String(i.numero).includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [items, filtroLocal, filtroEntrega, buscaVendidos]);


  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("chamado_denis_itens")
      .select(SELECT_COLS)
      .eq("tenant_id", tenantId)
      .order("numero", { ascending: true });
    if (error) toast.error("Erro ao carregar itens");
    else setItems((data || []) as Item[]);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime
  useEffect(() => {
    if (!tenantId) return;
    const ch = supabase
      .channel("vendas-online-" + tenantId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chamado_denis_itens", filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          setItems((prev) => {
            if (payload.eventType === "DELETE") {
              return prev.filter((i) => i.id !== (payload.old as Item).id);
            }
            const row = payload.new as Item;
            const idx = prev.findIndex((i) => i.id === row.id);
            if (idx === -1) return [...prev, row].sort((a, b) => a.numero - b.numero);
            const copy = [...prev];
            copy[idx] = { ...copy[idx], ...row };
            return copy;
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [tenantId]);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (filtroStatus === "disponivel" || filtroStatus === "vendido") {
        if (i.status !== filtroStatus) return false;
      } else if (filtroStatus === "pago") {
        if (i.abacate_status !== "PAID") return false;
      } else if (filtroStatus === "pendente") {
        if (i.abacate_status !== "PENDING") return false;
      } else if (filtroStatus === "sem_link") {
        if (i.abacate_url) return false;
      }
      if (busca && !i.descricao.toLowerCase().includes(busca.toLowerCase()) && !String(i.numero).includes(busca))
        return false;
      return true;
    });
  }, [items, busca, filtroStatus]);

  const totals = useMemo(() => {
    const disp = items.filter((i) => i.status === "disponivel");
    const vend = items.filter((i) => i.status === "vendido");
    return {
      qtdDisp: disp.length,
      qtdVend: vend.length,
      somaDisp: disp.reduce((s, i) => s + Number(i.valor || 0), 0),
      somaVend: vend.reduce((s, i) => s + Number(i.valor || 0), 0),
    };
  }, [items]);

  const startEdit = (id: string, field: "descricao" | "valor" | "status", current: string | number) => {
    setEditing(`${id}-${field}` as CellKey);
    setDraftValue(String(current ?? ""));
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraftValue("");
  };

  const commitEdit = async (item: Item, field: "descricao" | "valor" | "status") => {
    const original = item[field] as string | number;
    let newValue: string | number = draftValue;
    if (field === "valor") {
      const n = Number(String(draftValue).replace(",", "."));
      if (isNaN(n) || n < 0) {
        toast.error("Valor inválido");
        cancelEdit();
        return;
      }
      newValue = n;
    } else if (field === "descricao") {
      newValue = draftValue.slice(0, 500);
    } else if (field === "status") {
      if (draftValue !== "disponivel" && draftValue !== "vendido") {
        cancelEdit();
        return;
      }
    }
    if (String(newValue) === String(original)) {
      cancelEdit();
      return;
    }
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, [field]: newValue as never } : i)));
    cancelEdit();
    const patch: { descricao?: string; valor?: number; status?: "disponivel" | "vendido" } = {};
    if (field === "descricao") patch.descricao = newValue as string;
    else if (field === "valor") patch.valor = newValue as number;
    else if (field === "status") patch.status = newValue as "disponivel" | "vendido";
    const { error } = await supabase.from("chamado_denis_itens").update(patch).eq("id", item.id);
    if (error) {
      toast.error("Falha ao salvar");
      load();
    }
  };

  const addRow = async () => {
    if (!tenantId || creating) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("chamado_denis_itens")
      .insert({ tenant_id: tenantId, numero: 0, descricao: "", valor: 0, status: "disponivel" })
      .select(SELECT_COLS)
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error("Erro ao criar item");
      return;
    }
    setItems((prev) => [...prev, data as Item]);
    setTimeout(() => startEdit((data as Item).id, "descricao", ""), 50);
  };

  const removeRow = async (id: string) => {
    if (!confirm("Excluir este item?")) return;
    const prev = items;
    setItems((p) => p.filter((i) => i.id !== id));
    const { error } = await supabase.from("chamado_denis_itens").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir");
      setItems(prev);
    }
  };

  const gerarLink = async (item: Item) => {
    if (Number(item.valor || 0) <= 0) {
      toast.error("Defina um valor maior que zero antes de gerar o link.");
      return;
    }
    setGenerating(item.id);
    const { data, error } = await supabase.functions.invoke("vendas-online-criar-link", {
      body: { item_id: item.id },
    });
    setGenerating(null);

    // Se houve erro HTTP, tenta extrair body retornado pela function
    if (error) {
      let body: any = null;
      try { body = await (error as any).context?.json?.(); } catch { /* noop */ }
      const msg =
        body?.message ||
        (body?.error === "abacate_not_configured" ? "Configure sua chave AbacatePay primeiro." : null) ||
        body?.error ||
        error.message ||
        "Falha ao gerar link";
      const desc = [
        body?.httpStatus ? `HTTP ${body.httpStatus}` : null,
        body?.stage ? `etapa: ${body.stage}` : null,
      ].filter(Boolean).join(" · ");
      toast.error(msg, { description: desc || undefined });
      console.error("gerar link erro:", { error, body });
      return;
    }

    if (data?.error === "abacate_not_configured") {
      toast.error("Configure sua chave AbacatePay primeiro.");
      return;
    }
    if (data?.error) {
      const desc = [
        data.httpStatus ? `HTTP ${data.httpStatus}` : null,
        data.stage ? `etapa: ${data.stage}` : null,
      ].filter(Boolean).join(" · ");
      toast.error(data.message || data.error, { description: desc || undefined });
      console.error("gerar link payload:", data);
      return;
    }
    if (data?.url) {
      navigator.clipboard.writeText(data.url).catch(() => {});
      toast.success("Link gerado e copiado!");
    }
    load();
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("Link copiado");
  };

  const sincronizarStatus = async (item: Item) => {
    setSyncing(item.id);
    const { data, error } = await supabase.functions.invoke("vendas-online-sincronizar-status", {
      body: { item_id: item.id },
    });
    setSyncing(null);
    if (error) {
      let body: any = null;
      try { body = await (error as any).context?.json?.(); } catch { /* noop */ }
      toast.error(body?.message || error.message || "Falha ao sincronizar");
      return;
    }
    if (data?.error) {
      toast.error(data.message || data.error);
      return;
    }
    if (data?.status === "PAID") {
      toast.success("Pagamento confirmado!");
    } else {
      toast.info(`Status na AbacatePay: ${data?.status || "desconhecido"}`);
    }
    load();
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>, item: Item, field: "descricao" | "valor") => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit(item, field);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    } else if (e.key === "Tab") {
      e.preventDefault();
      commitEdit(item, field);
      setTimeout(() => {
        if (field === "descricao") startEdit(item.id, "valor", item.valor);
      }, 30);
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Vendas Online</h1>
            <p className="text-muted-foreground">
              Tabela editável estilo planilha — clique em qualquer célula para editar e gere links de pagamento.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/vendas-online/config">
                <Settings className="h-4 w-4 mr-2" /> AbacatePay
              </Link>
            </Button>
            <Button onClick={addRow} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Nova linha
            </Button>
          </div>
        </div>

        <Collapsible open={openGroups.vendas} onOpenChange={() => toggleGroup("vendas")} className="space-y-3 rounded-lg border bg-card/30 p-3">
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left">
            <ChevronDown className={"h-4 w-4 transition-transform " + (openGroups.vendas ? "" : "-rotate-90")} />
            <ShoppingCart className="h-4 w-4" />
            <span className="font-semibold">Vendas online</span>
            <Badge variant="outline" className="ml-1">{items.length}</Badge>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3">
        <div className="flex gap-3 flex-wrap items-center">
          <Input
            placeholder="Buscar por descrição ou ID..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="max-w-xs"
          />
          <Select value={filtroStatus} onValueChange={(v) => setFiltroStatus(v as typeof filtroStatus)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="disponivel">Disponível</SelectItem>
              <SelectItem value="vendido">Vendido</SelectItem>
              <SelectItem value="pago">Pago (AbacatePay)</SelectItem>
              <SelectItem value="pendente">Aguardando pagamento</SelectItem>
              <SelectItem value="sem_link">Sem link</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">ID</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-36">Valor</TableHead>
                <TableHead className="w-36">Status</TableHead>
                <TableHead className="w-56">Pagamento</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhum item. Clique em "Nova linha" para começar.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((item) => {
                  const editDesc = editing === `${item.id}-descricao`;
                  const editVal = editing === `${item.id}-valor`;
                  const editStatus = editing === `${item.id}-status`;
                  const isPaid = item.abacate_status === "PAID";
                  const statusReadOnly = isPaid;
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-muted-foreground">#{item.numero}</TableCell>
                      <TableCell onClick={() => !editDesc && startEdit(item.id, "descricao", item.descricao)}>
                        {editDesc ? (
                          <Input
                            autoFocus
                            value={draftValue}
                            onChange={(e) => setDraftValue(e.target.value)}
                            onBlur={() => commitEdit(item, "descricao")}
                            onKeyDown={(e) => handleKey(e, item, "descricao")}
                            className="h-8"
                          />
                        ) : (
                          <span className={item.descricao ? "" : "text-muted-foreground italic"}>
                            {item.descricao || "Clique para editar"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell onClick={() => !editVal && startEdit(item.id, "valor", item.valor)}>
                        {editVal ? (
                          <Input
                            autoFocus
                            type="number"
                            step="0.01"
                            min="0"
                            value={draftValue}
                            onChange={(e) => setDraftValue(e.target.value)}
                            onBlur={() => commitEdit(item, "valor")}
                            onKeyDown={(e) => handleKey(e, item, "valor")}
                            className="h-8"
                          />
                        ) : (
                          <span>{brl(Number(item.valor || 0))}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editStatus && !statusReadOnly ? (
                          <Select
                            open
                            value={draftValue}
                            onValueChange={(v) => {
                              setDraftValue(v);
                              setTimeout(() => commitEdit({ ...item, status: v as Item["status"] }, "status"), 0);
                            }}
                          >
                            <SelectTrigger className="h-8 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="disponivel">Disponível</SelectItem>
                              <SelectItem value="vendido">Vendido</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <button
                            type="button"
                            onClick={() => !statusReadOnly && startEdit(item.id, "status", item.status)}
                            className={statusReadOnly ? "cursor-default" : "cursor-pointer"}
                            title={statusReadOnly ? "Pago via AbacatePay — bloqueado" : ""}
                          >
                            {item.status === "disponivel" ? (
                              <Badge className="bg-green-600 hover:bg-green-700">Disponível</Badge>
                            ) : (
                              <Badge variant="secondary">Vendido</Badge>
                            )}
                          </button>
                        )}
                      </TableCell>
                      <TableCell>
                        {isPaid ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1.5 text-sm">
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                                <span className="font-medium truncate max-w-[160px]">
                                  Pago{item.pagador_nome ? ` · ${item.pagador_nome}` : ""}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs space-y-0.5">
                              {item.pagador_nome && <div>Nome: {item.pagador_nome}</div>}
                              {item.pagador_email && <div>Email: {item.pagador_email}</div>}
                              {item.pagador_cel && <div>Tel: {item.pagador_cel}</div>}
                              {item.pagador_tax_id && <div>CPF/CNPJ: {item.pagador_tax_id}</div>}
                              {item.pago_em && (
                                <div>Pago em: {new Date(item.pago_em).toLocaleString("pt-BR")}</div>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        ) : item.abacate_url ? (
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-xs">
                              {item.abacate_status || "PENDING"}
                            </Badge>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyUrl(item.abacate_url!)}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button asChild size="icon" variant="ghost" className="h-7 w-7">
                              <a href={item.abacate_url} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => sincronizarStatus(item)}
                                  disabled={syncing === item.id}
                                >
                                  {syncing === item.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Sincronizar status com AbacatePay</TooltipContent>
                            </Tooltip>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => gerarLink(item)}
                            disabled={generating === item.id}
                          >
                            {generating === item.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                            ) : (
                              <Link2 className="h-3.5 w-3.5 mr-1" />
                            )}
                            Gerar link
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => removeRow(item.id)} className="h-8 w-8">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Itens disponíveis</p>
            <p className="text-2xl font-bold">{totals.qtdDisp}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Valor disponível</p>
            <p className="text-2xl font-bold">{brl(totals.somaDisp)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Itens vendidos</p>
            <p className="text-2xl font-bold">{totals.qtdVend}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Valor vendido</p>
            <p className="text-2xl font-bold">{brl(totals.somaVend)}</p>
          </div>
        </div>

        {/* ===== Produtos vendidos ===== */}
        <div className="space-y-3 pt-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2"><Package className="h-5 w-5" /> Produtos vendidos</h2>
              <p className="text-sm text-muted-foreground">Aloque cada produto vendido em um local físico e marque a entrega ao cliente.</p>
            </div>
          </div>

          <div className="flex gap-3 flex-wrap items-center">
            <Input placeholder="Buscar por cliente, CPF, descrição..." value={buscaVendidos} onChange={(e) => setBuscaVendidos(e.target.value)} className="w-full sm:max-w-xs" />
            <Select value={filtroLocal} onValueChange={setFiltroLocal}>
              <SelectTrigger className="w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os locais</SelectItem>
                <SelectItem value="sem_local">Sem local</SelectItem>
                {locais.filter(l => l.ativo).map(l => (
                  <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroEntrega} onValueChange={(v) => setFiltroEntrega(v as typeof filtroEntrega)}>
              <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendente">Aguardando entrega</SelectItem>
                <SelectItem value="entregue">Entregues</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block rounded-lg border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">ID</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-28">Valor</TableHead>
                  <TableHead className="w-28">Pagamento</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="w-48">Local</TableHead>
                  <TableHead className="w-28">Entregue?</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendidos.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum produto vendido encontrado.</TableCell></TableRow>
                ) : vendidos.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-muted-foreground">#{item.numero}</TableCell>
                    <TableCell className="max-w-[260px] truncate">{item.descricao}</TableCell>
                    <TableCell>{brl(Number(item.valor || 0))}</TableCell>
                    <TableCell>{item.forma_pagamento ? <Badge variant="outline">{item.forma_pagamento}</Badge> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                    <TableCell>
                      {item.abacate_status === "PAID"
                        ? <Badge className="bg-green-600 hover:bg-green-700">Pago</Badge>
                        : <Badge variant="secondary">Vendido</Badge>}
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="text-sm">
                            <div className="font-medium truncate max-w-[200px]">{item.pagador_nome || <span className="text-muted-foreground italic">Sem nome</span>}</div>
                            {item.pagador_tax_id && <div className="text-xs text-muted-foreground">{item.pagador_tax_id}</div>}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs space-y-0.5">
                          {item.pagador_email && <div>Email: {item.pagador_email}</div>}
                          {item.pagador_cel && <div>Tel: {item.pagador_cel}</div>}
                          {item.pago_em && <div>Pago em: {new Date(item.pago_em).toLocaleString("pt-BR")}</div>}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Select value={item.local_id ?? "__none__"} onValueChange={(v) => setItemLocal(item, v === "__none__" ? null : v)}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="— sem local —" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— sem local —</SelectItem>
                          {locais.filter(l => l.ativo || l.id === item.local_id).map(l => (
                            <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {item.entregue
                        ? <button type="button" onClick={() => setVerEntregaItem(item)}><Badge className="bg-green-600 hover:bg-green-700 cursor-pointer">Sim</Badge></button>
                        : <Badge variant="outline">Não</Badge>}
                      {item.entregue && item.entregue_em && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">{new Date(item.entregue_em).toLocaleDateString("pt-BR")}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => item.entregue ? setDesfazerItem(item) : setEntregaItem(item)}>
                            <PackageCheck className={"h-4 w-4 " + (item.entregue ? "text-green-600" : "")} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{item.entregue ? "Desfazer entrega" : "Confirmar entrega"}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {vendidos.length === 0 ? (
              <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">Nenhum produto vendido encontrado.</div>
            ) : vendidos.map((item) => (
              <div key={item.id} className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground font-mono">#{item.numero}</div>
                    <div className="font-medium text-sm break-words">{item.descricao}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold">{brl(Number(item.valor || 0))}</div>
                    {item.forma_pagamento && <Badge variant="outline" className="text-[10px] mt-1">{item.forma_pagamento}</Badge>}
                  </div>
                </div>
                <div className="text-xs">
                  <div className="font-medium">{item.pagador_nome || <span className="text-muted-foreground italic">Sem nome</span>}</div>
                  {item.pagador_tax_id && <div className="text-muted-foreground">CPF: {item.pagador_tax_id}</div>}
                  {item.pagador_cel && <div className="text-muted-foreground">Tel: {item.pagador_cel}</div>}
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1">Local</div>
                  <Select value={item.local_id ?? "__none__"} onValueChange={(v) => setItemLocal(item, v === "__none__" ? null : v)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="— sem local —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— sem local —</SelectItem>
                      {locais.filter(l => l.ativo || l.id === item.local_id).map(l => (
                        <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between pt-1">
                  {item.entregue ? (
                    <button type="button" onClick={() => setVerEntregaItem(item)} className="text-left">
                      <Badge className="bg-green-600 hover:bg-green-700">Entregue</Badge>
                      {item.entregue_em && <div className="text-[10px] text-muted-foreground">{new Date(item.entregue_em).toLocaleString("pt-BR")}</div>}
                    </button>
                  ) : (
                    <Badge variant="outline">Aguardando entrega</Badge>
                  )}
                  <Button
                    size="sm"
                    variant={item.entregue ? "outline" : "default"}
                    onClick={() => item.entregue ? setDesfazerItem(item) : setEntregaItem(item)}
                  >
                    <PackageCheck className="h-4 w-4 mr-1" />
                    {item.entregue ? "Desfazer" : "Entregar"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ===== Dialogs de entrega ===== */}
        {entregaItem && (
          <ConfirmarEntregaDialog
            open={!!entregaItem}
            onOpenChange={(v) => { if (!v) setEntregaItem(null); }}
            itemNumero={entregaItem.numero}
            itemDescricao={entregaItem.descricao}
            pagadorNome={entregaItem.pagador_nome}
            pagadorTaxId={entregaItem.pagador_tax_id}
            onConfirm={(payload) => confirmarEntrega(entregaItem, payload)}
          />
        )}

        <AlertDialog open={!!desfazerItem} onOpenChange={(v) => { if (!v) setDesfazerItem(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Desfazer entrega?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação remove o registro de quem retirou e a assinatura. O item voltará para "Aguardando entrega".
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => { if (desfazerItem) { desfazerEntrega(desfazerItem); setDesfazerItem(null); } }}>
                Desfazer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <ComprovanteEntregaDialog
          open={!!verEntregaItem}
          onOpenChange={(v) => { if (!v) setVerEntregaItem(null); }}
          item={verEntregaItem}
        />

        {/* ===== Locais ===== */}
        <div className="space-y-3 pt-4">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2"><MapPin className="h-5 w-5" /> Locais</h2>
            <p className="text-sm text-muted-foreground">Cadastre os locais físicos onde os produtos vendidos ficam alocados até a retirada do cliente.</p>
          </div>

          <div className="flex gap-2 max-w-md">
            <Input
              placeholder="Nome do local (ex: Prateleira A1)"
              value={novoLocalNome}
              onChange={(e) => setNovoLocalNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addLocal(); }}
            />
            <Button onClick={addLocal} disabled={criandoLocal || !novoLocalNome.trim()}>
              {criandoLocal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adicionar
            </Button>
          </div>

          <div className="rounded-lg border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-28">Itens alocados</TableHead>
                  <TableHead className="w-20">Ativo</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {locais.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Nenhum local cadastrado.</TableCell></TableRow>
                ) : locais.map((l) => {
                  const qtd = items.filter(i => i.local_id === l.id && !i.entregue).length;
                  return (
                    <TableRow key={l.id}>
                      <TableCell>
                        <Input
                          defaultValue={l.nome}
                          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== l.nome) updateLocal(l.id, { nome: v }); }}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          defaultValue={l.descricao ?? ""}
                          onBlur={(e) => { const v = e.target.value; if (v !== (l.descricao ?? "")) updateLocal(l.id, { descricao: v || null }); }}
                          className="h-8"
                          placeholder="—"
                        />
                      </TableCell>
                      <TableCell><Badge variant="outline">{qtd}</Badge></TableCell>
                      <TableCell>
                        <Switch checked={l.ativo} onCheckedChange={(v) => updateLocal(l.id, { ativo: v })} />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeLocal(l.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
