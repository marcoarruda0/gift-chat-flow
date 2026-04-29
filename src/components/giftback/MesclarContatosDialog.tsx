import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { mascararCPF, mascararTelefoneBR } from "@/lib/br-format";
import type { ContatoCaixa } from "./NovoContatoCaixaDialog";

export interface ContatoCompleto extends ContatoCaixa {
  email?: string | null;
  data_nascimento?: string | null;
  created_at?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Lado A" — geralmente o contato existente encontrado por CPF */
  contatoA: ContatoCompleto | null;
  /** "Lado B" — contato existente encontrado por telefone (ou contato "virtual" com dados novos do form) */
  contatoB: ContatoCompleto | null;
  /** Quando o lado B é só os dados do formulário (não existe ainda no banco), passar true. */
  ladoBVirtual?: boolean;
  /** Valores forçados a aplicar no contato resultante (ex.: novo CPF/telefone digitado pelo operador). */
  forcar?: { cpf?: string | null; telefone?: string | null };
  onMesclado: (contato: ContatoCaixa) => void;
}

const fmtData = (s?: string | null) => {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("pt-BR");
  } catch {
    return s;
  }
};

const fmtMoeda = (v?: number | null) =>
  `R$ ${Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const fmtRFV = (c?: ContatoCompleto | null) => {
  if (!c) return "—";
  const r = c.rfv_recencia ?? "-";
  const f = c.rfv_frequencia ?? "-";
  const v = c.rfv_valor ?? "-";
  return `${r}-${f}-${v}`;
};

export function MesclarContatosDialog({
  open,
  onOpenChange,
  contatoA,
  contatoB,
  ladoBVirtual = false,
  forcar,
  onMesclado,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mesclando, setMesclando] = useState(false);

  // Definir o "alvo" sugerido = mais antigo (preserva mais histórico). Se um lado é virtual, alvo é o real.
  const alvoSugerido = useMemo(() => {
    if (!contatoA && !contatoB) return null;
    if (ladoBVirtual) return contatoA;
    if (!contatoA) return contatoB;
    if (!contatoB) return contatoA;
    const dA = contatoA.created_at ? new Date(contatoA.created_at).getTime() : Number.MAX_SAFE_INTEGER;
    const dB = contatoB.created_at ? new Date(contatoB.created_at).getTime() : Number.MAX_SAFE_INTEGER;
    return dA <= dB ? contatoA : contatoB;
  }, [contatoA, contatoB, ladoBVirtual]);

  const origemSugerida = useMemo(() => {
    if (!alvoSugerido) return null;
    return alvoSugerido.id === contatoA?.id ? contatoB : contatoA;
  }, [alvoSugerido, contatoA, contatoB]);

  const handleConfirmar = async () => {
    if (!alvoSugerido) return;

    // Caso 1: lado B é virtual (apenas complementar dado faltante no contato existente)
    if (ladoBVirtual) {
      setMesclando(true);
      try {
        const update: { cpf?: string; telefone?: string } = {};
        if (forcar?.cpf) update.cpf = forcar.cpf;
        if (forcar?.telefone) update.telefone = forcar.telefone;

        const { data, error } = await supabase
          .from("contatos")
          .update(update)
          .eq("id", alvoSugerido.id)
          .select(
            "id, nome, telefone, cpf, saldo_giftback, rfv_recencia, rfv_frequencia, rfv_valor",
          )
          .single();
        if (error) throw error;

        queryClient.invalidateQueries({ queryKey: ["contatos"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-contatos"] });
        toast({
          title: "✓ Cadastro complementado",
          description: `Dados adicionados a ${data.nome}.`,
        });
        onMesclado(data as ContatoCaixa);
        onOpenChange(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao complementar";
        toast({ title: "Erro", description: msg, variant: "destructive" });
      } finally {
        setMesclando(false);
      }
      return;
    }

    // Caso 2: merge real entre dois contatos via edge function
    if (!origemSugerida) return;
    setMesclando(true);
    try {
      const { data, error } = await supabase.functions.invoke("mesclar-contatos", {
        body: {
          alvo_id: alvoSugerido.id,
          origem_id: origemSugerida.id,
          forcar,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      queryClient.invalidateQueries({ queryKey: ["contatos"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-contatos"] });
      toast({
        title: "✓ Contatos mesclados",
        description: `Histórico unificado em ${data.contato.nome}.`,
      });
      onMesclado(data.contato as ContatoCaixa);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao mesclar";
      toast({ title: "Falha ao mesclar", description: msg, variant: "destructive" });
    } finally {
      setMesclando(false);
    }
  };

  const linhas: Array<{ label: string; a: string; b: string }> = useMemo(() => {
    return [
      { label: "Nome", a: contatoA?.nome ?? "—", b: contatoB?.nome ?? "—" },
      {
        label: "CPF",
        a: contatoA?.cpf ? mascararCPF(contatoA.cpf) : "—",
        b: contatoB?.cpf ? mascararCPF(contatoB.cpf) : "—",
      },
      {
        label: "Telefone",
        a: contatoA?.telefone ? mascararTelefoneBR(contatoA.telefone) : "—",
        b: contatoB?.telefone ? mascararTelefoneBR(contatoB.telefone) : "—",
      },
      { label: "E-mail", a: contatoA?.email ?? "—", b: contatoB?.email ?? "—" },
      { label: "Nascimento", a: fmtData(contatoA?.data_nascimento), b: fmtData(contatoB?.data_nascimento) },
      { label: "Saldo giftback", a: fmtMoeda(contatoA?.saldo_giftback), b: fmtMoeda(contatoB?.saldo_giftback) },
      { label: "RFV", a: fmtRFV(contatoA), b: fmtRFV(contatoB) },
      { label: "Criado em", a: fmtData(contatoA?.created_at), b: fmtData(contatoB?.created_at) },
    ];
  }, [contatoA, contatoB]);

  const titulo = ladoBVirtual ? "Complementar cadastro existente" : "Possível duplicidade — mesclar contatos?";
  const descricao = ladoBVirtual
    ? "Encontramos um cadastro com um dos dados informados. Confirme os dados antes de complementar."
    : "Os dois cadastros abaixo parecem ser da mesma pessoa. A mesclagem unifica todo o histórico (compras, giftback, mensagens) no cadastro mais antigo. Esta ação é irreversível.";

  return (
    <AlertDialog open={open} onOpenChange={(o) => !mesclando && onOpenChange(o)}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2 text-muted-foreground font-medium w-1/4">Campo</th>
                <th className={`text-left p-2 font-medium ${alvoSugerido?.id === contatoA?.id ? "text-primary" : ""}`}>
                  Cadastro A
                  {alvoSugerido?.id === contatoA?.id && (
                    <span className="ml-2 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                      será mantido
                    </span>
                  )}
                </th>
                <th className={`text-left p-2 font-medium ${alvoSugerido?.id === contatoB?.id ? "text-primary" : ""}`}>
                  {ladoBVirtual ? "Dados novos" : "Cadastro B"}
                  {alvoSugerido?.id === contatoB?.id && !ladoBVirtual && (
                    <span className="ml-2 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                      será mantido
                    </span>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.label} className="border-b last:border-0">
                  <td className="p-2 text-muted-foreground">{l.label}</td>
                  <td className="p-2">{l.a}</td>
                  <td className="p-2">{l.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!ladoBVirtual && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
            ⚠️ Após a mesclagem, o cadastro <strong>B</strong> será removido e seu histórico passará para o cadastro <strong>A</strong>.
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={mesclando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleConfirmar();
            }}
            disabled={mesclando || !alvoSugerido}
          >
            {mesclando ? "Mesclando..." : ladoBVirtual ? "Complementar e continuar" : "Mesclar e continuar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
