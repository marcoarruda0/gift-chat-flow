import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  SEGMENTOS,
  SEGMENTOS_ORDENADOS,
  type SegmentoKey,
} from "@/lib/rfv-segments";

interface RegraLocal {
  id?: string;
  segmento: SegmentoKey;
  ativo: boolean;
  percentual: string;
  validade_dias: string;
  compra_minima: string;
  credito_maximo: string;
  max_resgate_pct: string;
}

interface Props {
  configGlobal: {
    percentual: number | null;
    validade_dias: number | null;
    compra_minima: number | null;
    credito_maximo: number | null;
    max_resgate_pct: number | null;
  } | null | undefined;
}

const SEGMENTOS_VALIDOS = SEGMENTOS_ORDENADOS.filter((s) => s.key !== "sem_dados");

export default function RegrasRfvConfig({ configGlobal }: Props) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [regras, setRegras] = useState<RegraLocal[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["giftback-config-rfv"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("giftback_config_rfv")
        .select("*")
        .order("segmento");
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.tenant_id,
  });

  useEffect(() => {
    if (data) {
      setRegras(
        data.map((r: any) => ({
          id: r.id,
          segmento: r.segmento as SegmentoKey,
          ativo: r.ativo,
          percentual: r.percentual?.toString() ?? "",
          validade_dias: r.validade_dias?.toString() ?? "",
          compra_minima: r.compra_minima?.toString() ?? "",
          credito_maximo: r.credito_maximo?.toString() ?? "",
          max_resgate_pct: r.max_resgate_pct?.toString() ?? "",
        })),
      );
    }
  }, [data]);

  const segmentosDisponiveis = SEGMENTOS_VALIDOS.filter(
    (s) => !regras.some((r) => r.segmento === s.key),
  );

  const adicionarRegra = (segmento: SegmentoKey) => {
    setRegras((prev) => [
      ...prev,
      {
        segmento,
        ativo: true,
        percentual: "",
        validade_dias: "",
        compra_minima: "",
        credito_maximo: "",
        max_resgate_pct: "",
      },
    ]);
  };

  const atualizarCampo = (segmento: SegmentoKey, campo: keyof RegraLocal, valor: any) => {
    setRegras((prev) =>
      prev.map((r) => (r.segmento === segmento ? { ...r, [campo]: valor } : r)),
    );
  };

  const removerRegra = async (segmento: SegmentoKey) => {
    const regra = regras.find((r) => r.segmento === segmento);
    if (regra?.id) {
      const { error } = await supabase
        .from("giftback_config_rfv")
        .delete()
        .eq("id", regra.id);
      if (error) {
        toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
        return;
      }
      qc.invalidateQueries({ queryKey: ["giftback-config-rfv"] });
      toast({ title: "Regra removida" });
    } else {
      setRegras((prev) => prev.filter((r) => r.segmento !== segmento));
    }
  };

  const parseOptional = (v: string): number | null => {
    if (v.trim() === "") return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };

  const salvarMutation = useMutation({
    mutationFn: async () => {
      const payload = regras.map((r) => ({
        ...(r.id ? { id: r.id } : {}),
        tenant_id: profile!.tenant_id!,
        segmento: r.segmento,
        ativo: r.ativo,
        percentual: parseOptional(r.percentual),
        validade_dias: parseOptional(r.validade_dias) === null ? null : Math.round(parseOptional(r.validade_dias)!),
        compra_minima: parseOptional(r.compra_minima),
        credito_maximo: parseOptional(r.credito_maximo),
        max_resgate_pct: parseOptional(r.max_resgate_pct),
      }));
      if (payload.length === 0) return;
      const { error } = await supabase
        .from("giftback_config_rfv")
        .upsert(payload, { onConflict: "tenant_id,segmento" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["giftback-config-rfv"] });
      toast({ title: "Regras por segmento salvas!" });
    },
    onError: (err: any) =>
      toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const placeholderGlobal = (campo: keyof typeof DEFAULT_PH) => {
    if (!configGlobal) return DEFAULT_PH[campo];
    const map: Record<keyof typeof DEFAULT_PH, number | null | undefined> = {
      percentual: configGlobal.percentual,
      validade_dias: configGlobal.validade_dias,
      compra_minima: configGlobal.compra_minima,
      credito_maximo: configGlobal.credito_maximo,
      max_resgate_pct: configGlobal.max_resgate_pct,
    };
    const v = map[campo];
    return v != null ? `herda: ${v}` : DEFAULT_PH[campo];
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle>Parâmetros por Perfil RFV</CardTitle>
            <CardDescription>
              Sobrescreva o giftback global para segmentos específicos. Campos vazios herdam do global.
              Clientes sem RFV calculado sempre usam o global.
            </CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={segmentosDisponiveis.length === 0}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar regra por segmento
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {segmentosDisponiveis.map((s) => (
                <DropdownMenuItem key={s.key} onClick={() => adicionarRegra(s.key)}>
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full mr-2"
                    style={{ backgroundColor: s.cor }}
                  />
                  {s.nome}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : regras.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma regra por segmento. Clique em "Adicionar regra por segmento" para começar.
          </p>
        ) : (
          <div className="space-y-4">
            {regras
              .sort(
                (a, b) =>
                  SEGMENTOS_VALIDOS.findIndex((s) => s.key === a.segmento) -
                  SEGMENTOS_VALIDOS.findIndex((s) => s.key === b.segmento),
              )
              .map((r) => {
                const seg = SEGMENTOS[r.segmento];
                return (
                  <div key={r.segmento} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <span
                          className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium border-transparent"
                          style={{ backgroundColor: seg.cor, color: seg.textClass.includes("white") ? "#fff" : "#000" }}
                        >
                          {seg.nome}
                        </span>
                        <span className="text-xs text-muted-foreground">{seg.descricao}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={r.ativo}
                            onCheckedChange={(v) => atualizarCampo(r.segmento, "ativo", v)}
                          />
                          <Label className="text-xs">Ativo</Label>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removerRegra(r.segmento)}
                          aria-label="Remover regra"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">% Retorno</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder={placeholderGlobal("percentual")}
                          value={r.percentual}
                          onChange={(e) => atualizarCampo(r.segmento, "percentual", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Validade (dias)</Label>
                        <Input
                          type="number"
                          placeholder={placeholderGlobal("validade_dias")}
                          value={r.validade_dias}
                          onChange={(e) => atualizarCampo(r.segmento, "validade_dias", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Compra mín. (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder={placeholderGlobal("compra_minima")}
                          value={r.compra_minima}
                          onChange={(e) => atualizarCampo(r.segmento, "compra_minima", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Crédito máx. (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder={placeholderGlobal("credito_maximo")}
                          value={r.credito_maximo}
                          onChange={(e) => atualizarCampo(r.segmento, "credito_maximo", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">% Máx. resgate</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder={placeholderGlobal("max_resgate_pct")}
                          value={r.max_resgate_pct}
                          onChange={(e) => atualizarCampo(r.segmento, "max_resgate_pct", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            <Button onClick={() => salvarMutation.mutate()} disabled={salvarMutation.isPending}>
              {salvarMutation.isPending ? "Salvando..." : "Salvar regras por segmento"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const DEFAULT_PH = {
  percentual: "10",
  validade_dias: "30",
  compra_minima: "0",
  credito_maximo: "9999",
  max_resgate_pct: "100",
};
