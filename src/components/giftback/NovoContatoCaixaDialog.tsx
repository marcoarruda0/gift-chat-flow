import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import {
  apenasDigitos,
  ehProvavelCPF,
  gerarVariantesTelefone,
  mascararCPF,
  mascararTelefoneBR,
  normalizarTelefoneBR,
  validarCPF,
  validarTelefoneBR,
} from "@/lib/br-format";
import { MesclarContatosDialog, type ContatoCompleto } from "./MesclarContatosDialog";

export interface ContatoCaixa {
  id: string;
  nome: string;
  telefone: string | null;
  cpf: string | null;
  saldo_giftback: number;
  rfv_recencia: number | null;
  rfv_frequencia: number | null;
  rfv_valor: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  valorBuscado: string;
  onCriado: (contato: ContatoCaixa) => void;
}

const baseSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório").max(100, "Máx. 100 caracteres"),
  email: z
    .string()
    .trim()
    .email("E-mail inválido")
    .max(255)
    .optional()
    .or(z.literal("")),
  data_nascimento: z.string().optional().or(z.literal("")),
});

const emailSchema = z.string().trim().email().max(255);

// Versão completa para alimentar o modal de comparação
const SELECT_CONTATO_COMPLETO =
  "id, nome, telefone, cpf, saldo_giftback, rfv_recencia, rfv_frequencia, rfv_valor, email, data_nascimento, created_at";

interface MergeState {
  /** Cadastro existente A (geralmente match por CPF) */
  contatoA: ContatoCompleto | null;
  /** Cadastro existente B (match por telefone) ou null se for "complementar" */
  contatoB: ContatoCompleto | null;
  /** Quando true, contatoB é virtual (apenas dados novos do form) — fluxo de complementação */
  ladoBVirtual: boolean;
  /** Valores forçados a aplicar no contato resultante */
  forcar?: { cpf?: string | null; telefone?: string | null };
}

export function NovoContatoCaixaDialog({ open, onOpenChange, valorBuscado, onCriado }: Props) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState(""); // valor mascarado
  const [telefone, setTelefone] = useState(""); // valor mascarado
  const [email, setEmail] = useState("");
  const [emailDebounced, setEmailDebounced] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [merge, setMerge] = useState<MergeState | null>(null);

  // Pré-preenche CPF (se for CPF válido) ou telefone, já aplicando máscara
  useEffect(() => {
    if (!open) return;
    setNome("");
    setEmail("");
    setEmailDebounced("");
    setDataNascimento("");
    setErros({});
    setMerge(null);
    const limpo = valorBuscado.trim();
    if (ehProvavelCPF(limpo)) {
      setCpf(mascararCPF(limpo));
      setTelefone("");
    } else {
      setTelefone(mascararTelefoneBR(limpo));
      setCpf("");
    }
  }, [open, valorBuscado]);

  // Debounce do e-mail para validação em tempo real sem piscar
  useEffect(() => {
    const t = setTimeout(() => setEmailDebounced(email), 250);
    return () => clearTimeout(t);
  }, [email]);

  const emailInvalido = useMemo(() => {
    const v = emailDebounced.trim();
    if (!v) return false;
    return !emailSchema.safeParse(v).success;
  }, [emailDebounced]);

  const handleCpfChange = (v: string) => setCpf(mascararCPF(v));
  const handleTelChange = (v: string) => setTelefone(mascararTelefoneBR(v));

  /**
   * Busca contatos por CPF e por telefone. Para telefone usa as variantes
   * (com/sem DDI 55, com/sem 9 extra) para casar com registros gravados em formatos diferentes.
   * Retorna contatos completos para alimentar o modal de comparação.
   */
  const buscarMatches = async (cpfDigitos: string, telDigitos: string) => {
    let porCpf: ContatoCompleto | null = null;
    let porTel: ContatoCompleto | null = null;

    if (cpfDigitos) {
      const { data } = await supabase
        .from("contatos")
        .select(SELECT_CONTATO_COMPLETO)
        .eq("cpf", cpfDigitos)
        .maybeSingle();
      porCpf = (data as ContatoCompleto | null) ?? null;
    }
    if (telDigitos) {
      const variantes = gerarVariantesTelefone(telDigitos);
      if (variantes.length > 0) {
        const { data } = await supabase
          .from("contatos")
          .select(SELECT_CONTATO_COMPLETO)
          .in("telefone", variantes)
          .order("created_at", { ascending: true })
          .limit(1);
        porTel = ((data?.[0] as ContatoCompleto | undefined) ?? null);
      }
    }
    return { porCpf, porTel };
  };

  /**
   * Decide o que fazer baseado nos matches.
   *  - "carregar": já existe contato consistente, usar direto.
   *  - "merge": os dois lados existem mas em contatos distintos — abrir modal de comparação.
   *  - "complementar": só um lado existe e o outro campo do contato existente está vazio — abrir modal (lado B virtual).
   *  - "novo": pode seguir e criar.
   */
  const decidirAcao = (
    cpfDigitos: string,
    telDigitos: string,
    porCpf: ContatoCompleto | null,
    porTel: ContatoCompleto | null,
  ):
    | { tipo: "carregar"; contato: ContatoCompleto }
    | { tipo: "merge"; a: ContatoCompleto; b: ContatoCompleto; forcar?: { cpf?: string | null; telefone?: string | null } }
    | { tipo: "complementar"; existente: ContatoCompleto; campo: "cpf" | "telefone"; valorNovo: string }
    | { tipo: "novo" } => {
    // Mesmo contato em ambos os lados
    if (porCpf && porTel && porCpf.id === porTel.id) {
      return { tipo: "carregar", contato: porCpf };
    }

    // CPF e telefone pertencem a contatos diferentes — propor merge
    if (porCpf && porTel && porCpf.id !== porTel.id) {
      return {
        tipo: "merge",
        a: porCpf,
        b: porTel,
        // Mantém o CPF e o telefone digitados no resultante
        forcar: {
          cpf: cpfDigitos || null,
          telefone: telDigitos ? normalizarTelefoneBR(telDigitos) : null,
        },
      };
    }

    // Match só por telefone
    if (!porCpf && porTel) {
      if (cpfDigitos && !porTel.cpf) {
        return { tipo: "complementar", existente: porTel, campo: "cpf", valorNovo: cpfDigitos };
      }
      if (cpfDigitos && porTel.cpf && porTel.cpf !== cpfDigitos) {
        // Telefone do contato existente com CPF diferente do digitado — provavelmente cadastros distintos
        // Tratamos como "merge" virtual: lado A é o "novo" representado pelo form
        return {
          tipo: "complementar",
          existente: porTel,
          campo: "cpf",
          valorNovo: cpfDigitos,
        };
      }
      return { tipo: "carregar", contato: porTel };
    }

    // Match só por CPF
    if (porCpf && !porTel) {
      if (telDigitos && !porCpf.telefone) {
        return {
          tipo: "complementar",
          existente: porCpf,
          campo: "telefone",
          valorNovo: normalizarTelefoneBR(telDigitos),
        };
      }
      if (telDigitos && porCpf.telefone && normalizarTelefoneBR(porCpf.telefone) !== normalizarTelefoneBR(telDigitos)) {
        return {
          tipo: "complementar",
          existente: porCpf,
          campo: "telefone",
          valorNovo: normalizarTelefoneBR(telDigitos),
        };
      }
      return { tipo: "carregar", contato: porCpf };
    }

    return { tipo: "novo" };
  };

  /** Constrói um contato "virtual" representando os dados digitados agora no formulário. */
  const construirContatoVirtual = (cpfDigitos: string, telDigitos: string): ContatoCompleto => ({
    id: "novo",
    nome: nome.trim() || "(novo cadastro)",
    cpf: cpfDigitos || null,
    telefone: telDigitos ? normalizarTelefoneBR(telDigitos) : null,
    email: email.trim() || null,
    data_nascimento: dataNascimento || null,
    saldo_giftback: 0,
    rfv_recencia: null,
    rfv_frequencia: null,
    rfv_valor: null,
    created_at: null,
  });

  const handleSalvar = async () => {
    const novosErros: Record<string, string> = {};

    const baseParsed = baseSchema.safeParse({ nome, email, data_nascimento: dataNascimento });
    if (!baseParsed.success) {
      baseParsed.error.errors.forEach((e) => {
        const k = e.path[0] as string;
        if (k && !novosErros[k]) novosErros[k] = e.message;
      });
    }

    const cpfDigitos = apenasDigitos(cpf);
    const telDigitos = apenasDigitos(telefone);

    if (!cpfDigitos && !telDigitos) {
      novosErros.telefone = "Informe CPF ou telefone";
    }
    if (cpfDigitos && !validarCPF(cpfDigitos)) {
      novosErros.cpf = "CPF inválido";
    }
    if (telDigitos && !validarTelefoneBR(telDigitos)) {
      novosErros.telefone = "Telefone inválido (use DDD + número)";
    }

    if (Object.keys(novosErros).length > 0) {
      setErros(novosErros);
      return;
    }
    setErros({});

    if (!profile?.tenant_id) {
      toast({ title: "Sessão inválida", variant: "destructive" });
      return;
    }

    setSalvando(true);
    try {
      const { porCpf, porTel } = await buscarMatches(cpfDigitos, telDigitos);
      const decisao = decidirAcao(cpfDigitos, telDigitos, porCpf, porTel);

      if (decisao.tipo === "carregar") {
        toast({
          title: "Cliente já cadastrado",
          description: "Carregando o cadastro existente.",
        });
        onCriado(decisao.contato as ContatoCaixa);
        onOpenChange(false);
        return;
      }

      if (decisao.tipo === "merge") {
        setMerge({
          contatoA: decisao.a,
          contatoB: decisao.b,
          ladoBVirtual: false,
          forcar: decisao.forcar,
        });
        return;
      }

      if (decisao.tipo === "complementar") {
        const virtual = construirContatoVirtual(cpfDigitos, telDigitos);
        setMerge({
          contatoA: decisao.existente,
          contatoB: virtual,
          ladoBVirtual: true,
          forcar: decisao.campo === "cpf"
            ? { cpf: decisao.valorNovo }
            : { telefone: decisao.valorNovo },
        });
        return;
      }

      // novo → INSERT (telefone gravado em forma canônica sem DDI)
      const payload = {
        tenant_id: profile.tenant_id,
        nome: nome.trim(),
        telefone: telDigitos ? normalizarTelefoneBR(telDigitos) : null,
        cpf: cpfDigitos || null,
        email: email.trim() || null,
        data_nascimento: dataNascimento || null,
        campos_personalizados: {},
        tags: [],
        saldo_giftback: 0,
      };

      const { data: criado, error } = await supabase
        .from("contatos")
        .insert(payload)
        .select(SELECT_CONTATO_COMPLETO)
        .single();

      if (error) {
        // Rede de segurança: violação de unicidade por concorrência → reavalia.
        const code = (error as { code?: string }).code;
        if (code === "23505") {
          const segunda = await buscarMatches(cpfDigitos, telDigitos);
          const dec2 = decidirAcao(cpfDigitos, telDigitos, segunda.porCpf, segunda.porTel);
          if (dec2.tipo === "carregar") {
            toast({
              title: "Cliente já existente",
              description: "Carregando o cadastro existente.",
            });
            onCriado(dec2.contato as ContatoCaixa);
            onOpenChange(false);
            return;
          }
          if (dec2.tipo === "complementar") {
            const virtual = construirContatoVirtual(cpfDigitos, telDigitos);
            setMerge({
              contatoA: dec2.existente,
              contatoB: virtual,
              ladoBVirtual: true,
              forcar: dec2.campo === "cpf"
                ? { cpf: dec2.valorNovo }
                : { telefone: dec2.valorNovo },
            });
            return;
          }
          if (dec2.tipo === "merge") {
            setMerge({ contatoA: dec2.a, contatoB: dec2.b, ladoBVirtual: false, forcar: dec2.forcar });
            return;
          }
        }
        throw error;
      }

      queryClient.invalidateQueries({ queryKey: ["contatos"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-contatos"] });

      toast({
        title: "✓ Cliente cadastrado",
        description: `${(criado as ContatoCaixa).nome} foi adicionado e está pronto para a venda.`,
      });
      onCriado(criado as ContatoCaixa);
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao cadastrar";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  const podeSalvar = !salvando && !emailInvalido;


  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo cliente</DialogTitle>
            <DialogDescription>
              Cadastro rápido — você poderá completar os demais dados depois em Contatos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="nc-nome">Nome *</Label>
              <Input
                id="nc-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                autoFocus
                maxLength={100}
              />
              {erros.nome && <p className="text-xs text-destructive mt-1">{erros.nome}</p>}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="nc-cpf">CPF</Label>
                <Input
                  id="nc-cpf"
                  value={cpf}
                  onChange={(e) => handleCpfChange(e.target.value)}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  maxLength={14}
                />
                {erros.cpf && <p className="text-xs text-destructive mt-1">{erros.cpf}</p>}
              </div>
              <div>
                <Label htmlFor="nc-tel">Telefone</Label>
                <Input
                  id="nc-tel"
                  value={telefone}
                  onChange={(e) => handleTelChange(e.target.value)}
                  placeholder="(00) 00000-0000"
                  inputMode="numeric"
                  maxLength={16}
                />
                {erros.telefone && (
                  <p className="text-xs text-destructive mt-1">{erros.telefone}</p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="nc-email">E-mail</Label>
              <Input
                id="nc-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
                aria-invalid={emailInvalido}
                className={emailInvalido ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {(emailInvalido || erros.email) && (
                <p className="text-xs text-destructive mt-1">
                  {erros.email || "E-mail inválido"}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="nc-nasc">Data de nascimento</Label>
              <Input
                id="nc-nasc"
                type="date"
                value={dataNascimento}
                onChange={(e) => setDataNascimento(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={handleSalvar} disabled={!podeSalvar}>
              {salvando ? "Salvando..." : "Cadastrar e continuar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MesclarContatosDialog
        open={!!merge}
        onOpenChange={(o) => {
          if (!o) setMerge(null);
        }}
        contatoA={merge?.contatoA ?? null}
        contatoB={merge?.contatoB ?? null}
        ladoBVirtual={merge?.ladoBVirtual ?? false}
        forcar={merge?.forcar}
        onMesclado={(c) => {
          setMerge(null);
          onCriado(c);
          onOpenChange(false);
        }}
      />
    </>
  );
}
