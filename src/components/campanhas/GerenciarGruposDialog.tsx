import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Plus, Trash2, Pencil, Check, X, Tags } from "lucide-react";

export interface CampanhaGrupo {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string | null;
}

const PALETA_CORES = [
  "#3B82F6", // blue
  "#22C55E", // green
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#14B8A6", // teal
  "#6B7280", // gray
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Chamado após cada criação/edição/exclusão para o pai recarregar a lista. */
  onChanged?: () => void;
}

export function GerenciarGruposDialog({ open, onOpenChange, onChanged }: Props) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const tenantId = profile?.tenant_id;

  const [grupos, setGrupos] = useState<CampanhaGrupo[]>([]);
  const [loading, setLoading] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoDesc, setNovoDesc] = useState("");
  const [novaCor, setNovaCor] = useState(PALETA_CORES[0]);
  const [salvando, setSalvando] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCor, setEditCor] = useState<string>("");

  const carregar = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("campanha_grupos")
      .select("id, nome, descricao, cor")
      .eq("tenant_id", tenantId)
      .order("nome");
    if (error) {
      toast({ title: "Erro ao carregar grupos", description: error.message, variant: "destructive" });
    } else {
      setGrupos((data as CampanhaGrupo[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tenantId]);

  const criar = async () => {
    if (!tenantId || !novoNome.trim()) return;
    setSalvando(true);
    const { error } = await (supabase as any).from("campanha_grupos").insert({
      tenant_id: tenantId,
      nome: novoNome.trim(),
      descricao: novoDesc.trim() || null,
      cor: novaCor,
    });
    setSalvando(false);
    if (error) {
      toast({ title: "Erro ao criar grupo", description: error.message, variant: "destructive" });
      return;
    }
    setNovoNome("");
    setNovoDesc("");
    setNovaCor(PALETA_CORES[0]);
    toast({ title: "Grupo criado" });
    await carregar();
    onChanged?.();
  };

  const iniciarEdicao = (g: CampanhaGrupo) => {
    setEditId(g.id);
    setEditNome(g.nome);
    setEditDesc(g.descricao || "");
    setEditCor(g.cor || PALETA_CORES[0]);
  };

  const salvarEdicao = async () => {
    if (!editId || !editNome.trim()) return;
    const { error } = await (supabase as any)
      .from("campanha_grupos")
      .update({
        nome: editNome.trim(),
        descricao: editDesc.trim() || null,
        cor: editCor,
      })
      .eq("id", editId);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    setEditId(null);
    toast({ title: "Grupo atualizado" });
    await carregar();
    onChanged?.();
  };

  const excluir = async (g: CampanhaGrupo) => {
    if (!confirm(`Excluir o grupo "${g.nome}"? As campanhas associadas ficarão sem grupo.`)) return;
    // 1) Desvincula campanhas que usavam o grupo
    await (supabase as any)
      .from("campanhas")
      .update({ grupo_id: null })
      .eq("grupo_id", g.id);
    // 2) Exclui o grupo
    const { error } = await (supabase as any)
      .from("campanha_grupos")
      .delete()
      .eq("id", g.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Grupo excluído" });
    await carregar();
    onChanged?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tags className="h-5 w-5" /> Grupos de campanhas
          </DialogTitle>
          <DialogDescription>
            Agrupe campanhas relacionadas (ex.: "Black Friday", "Lançamento Verão")
            para análise consolidada futura.
          </DialogDescription>
        </DialogHeader>

        {/* Form de criação */}
        <div className="rounded-md border p-3 space-y-3 bg-muted/30">
          <div className="text-sm font-medium">Novo grupo</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Nome *</Label>
              <Input
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Ex.: Black Friday 2026"
                maxLength={80}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cor</Label>
              <div className="flex gap-1.5 flex-wrap pt-1">
                {PALETA_CORES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNovaCor(c)}
                    className={`h-6 w-6 rounded-full border-2 transition ${
                      novaCor === c ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Cor ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Descrição (opcional)</Label>
            <Textarea
              value={novoDesc}
              onChange={(e) => setNovoDesc(e.target.value)}
              placeholder="Breve descrição do agrupamento"
              rows={2}
              maxLength={200}
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={criar} disabled={salvando || !novoNome.trim()}>
              {salvando ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Plus className="h-3 w-3 mr-1" />
              )}
              Criar grupo
            </Button>
          </div>
        </div>

        {/* Lista */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Grupos existentes ({grupos.length})</div>
          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : grupos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum grupo criado ainda.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {grupos.map((g) => {
                const editando = editId === g.id;
                return (
                  <li
                    key={g.id}
                    className="rounded-md border p-2.5 flex items-start gap-2"
                  >
                    {editando ? (
                      <>
                        <div className="flex-1 space-y-2">
                          <Input
                            value={editNome}
                            onChange={(e) => setEditNome(e.target.value)}
                            className="h-8"
                          />
                          <Textarea
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            rows={2}
                          />
                          <div className="flex gap-1.5 flex-wrap">
                            {PALETA_CORES.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setEditCor(c)}
                                className={`h-5 w-5 rounded-full border-2 transition ${
                                  editCor === c ? "border-foreground scale-110" : "border-transparent"
                                }`}
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={salvarEdicao}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => setEditId(null)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span
                          className="h-3 w-3 rounded-full mt-1 shrink-0"
                          style={{ backgroundColor: g.cor || "#6B7280" }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{g.nome}</div>
                          {g.descricao && (
                            <div className="text-xs text-muted-foreground">{g.descricao}</div>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => iniciarEdicao(g)}
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => excluir(g)}
                            title="Excluir"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
