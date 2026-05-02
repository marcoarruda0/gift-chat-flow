import { useEffect, useMemo, useState, useCallback, useRef, KeyboardEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Item = {
  id: string;
  numero: number;
  descricao: string;
  valor: number;
  status: "disponivel" | "vendido";
};

type CellKey = `${string}-${"descricao" | "valor" | "status"}`;

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ChamadoDenis() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "disponivel" | "vendido">("todos");
  const [editing, setEditing] = useState<CellKey | null>(null);
  const [draftValue, setDraftValue] = useState<string>("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("chamado_denis_itens")
      .select("id, numero, descricao, valor, status")
      .eq("tenant_id", tenantId)
      .order("numero", { ascending: true });
    if (error) {
      toast.error("Erro ao carregar itens");
    } else {
      setItems((data || []) as Item[]);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (filtroStatus !== "todos" && i.status !== filtroStatus) return false;
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
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, [field]: newValue } : i)));
    cancelEdit();
    const patch: { descricao?: string; valor?: number; status?: string } = {};
    if (field === "descricao") patch.descricao = newValue as string;
    else if (field === "valor") patch.valor = newValue as number;
    else if (field === "status") patch.status = newValue as string;
    const { error } = await supabase
      .from("chamado_denis_itens")
      .update(patch)
      .eq("id", item.id);
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
      .insert({ tenant_id: tenantId, descricao: "", valor: 0, status: "disponivel" })
      .select("id, numero, descricao, valor, status")
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error("Erro ao criar item");
      return;
    }
    setItems((prev) => [...prev, data as Item]);
    setTimeout(() => startEdit(data.id, "descricao", ""), 50);
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
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Chamado Denis Online</h1>
          <p className="text-muted-foreground">Tabela editável estilo planilha — clique em qualquer célula para editar</p>
        </div>
        <Button onClick={addRow} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Nova linha
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <Input
          placeholder="Buscar por descrição ou ID..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filtroStatus} onValueChange={(v) => setFiltroStatus(v as typeof filtroStatus)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="disponivel">Disponível</SelectItem>
            <SelectItem value="vendido">Vendido</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">ID</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-40">Valor</TableHead>
              <TableHead className="w-40">Status</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Nenhum item. Clique em "Nova linha" para começar.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((item) => {
                const editDesc = editing === `${item.id}-descricao`;
                const editVal = editing === `${item.id}-valor`;
                const editStatus = editing === `${item.id}-status`;
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
                      {editStatus ? (
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
                          onClick={() => startEdit(item.id, "status", item.status)}
                          className="cursor-pointer"
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
  );
}
