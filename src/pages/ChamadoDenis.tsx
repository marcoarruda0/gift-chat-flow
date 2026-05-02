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
import { Plus, Trash2, Loader2, Settings, Link2, ExternalLink, Copy, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

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
};

type CellKey = `${string}-${"descricao" | "valor" | "status"}`;

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const SELECT_COLS =
  "id, numero, descricao, valor, status, abacate_billing_id, abacate_url, abacate_status, pagador_nome, pagador_email, pagador_cel, pagador_tax_id, pago_em";

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
    if (error) {
      toast.error("Falha ao gerar link: " + error.message);
      return;
    }
    if (data?.error === "abacate_not_configured") {
      toast.error("Configure sua chave AbacatePay primeiro.");
      return;
    }
    if (data?.error) {
      toast.error("Erro: " + data.error);
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
      </div>
    </TooltipProvider>
  );
}
