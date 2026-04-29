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

type CampoFaltante = "cpf" | "telefone";

interface PropostaJuncao {
  contato: ContatoCaixa;
  campo: CampoFaltante; // campo a preencher no contato existente
  valorNovo: string;    // dígitos a serem gravados
  valorMatch: string;   // dígitos do campo que casou (ex: telefone existente)
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
  const [proposta, setProposta] = useState<PropostaJuncao | null>(null);
  const [aplicandoJuncao, setAplicandoJuncao] = useState(false);

  // Pré-preenche CPF (se for CPF válido) ou telefone, já aplicando máscara
  useEffect(() => {
    if (!open) return;
    setNome("");
    setEmail("");
    setEmailDebounced("");
    setDataNascimento("");
    setErros({});
    setProposta(null);
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
   * Busca contatos por CPF e por telefone separadamente, retornando o que encontrou de cada lado.
   */
  const buscarMatches = async (cpfDigitos: string, telDigitos: string) => {
    let porCpf: ContatoCaixa | null = null;
    let porTel: ContatoCaixa | null = null;

    if (cpfDigitos) {
      const { data } = await supabase
        .from("contatos")
        .select(SELECT_CONTATO)
        .eq("cpf", cpfDigitos)
        .maybeSingle();
      porCpf = (data as ContatoCaixa | null) ?? null;
    }
    if (telDigitos) {
      const { data } = await supabase
        .from("contatos")
        .select(SELECT_CONTATO)
        .eq("telefone", telDigitos)
        .maybeSingle();
      porTel = (data as ContatoCaixa | null) ?? null;
    }
    return { porCpf, porTel };
  };

  /**
   * Decide o que fazer baseado nos matches. Retorna:
   *  - "carregar": já existe contato consistente, usar direto.
   *  - "conflito": CPF e telefone pertencem a contatos diferentes.
   *  - "juntar": existe um contato em que falta um dos campos — propõe complementar.
   *  - "novo": pode seguir e criar.
   */
  const decidirAcao = (
    cpfDigitos: string,
    telDigitos: string,
    porCpf: ContatoCaixa | null,
    porTel: ContatoCaixa | null,
  ):
    | { tipo: "carregar"; contato: ContatoCaixa }
    | { tipo: "conflito"; cpfNome: string; telNome: string }
    | { tipo: "juntar"; proposta: PropostaJuncao }
    | { tipo: "novo" } => {
    // Mesmo contato em ambos os lados
    if (porCpf && porTel && porCpf.id === porTel.id) {
      return { tipo: "carregar", contato: porCpf };
    }

    // CPF e telefone pertencem a contatos diferentes — não podemos decidir automaticamente
    if (porCpf && porTel && porCpf.id !== porTel.id) {
      return { tipo: "conflito", cpfNome: porCpf.nome, telNome: porTel.nome };
    }

    // Match só por telefone
    if (!porCpf && porTel) {
      // Se o operador informou CPF e o contato existente não tem CPF → propor juntar
      if (cpfDigitos && !porTel.cpf) {
        return {
          tipo: "juntar",
          proposta: {
            contato: porTel,
            campo: "cpf",
            valorNovo: cpfDigitos,
            valorMatch: telDigitos,
          },
        };
      }
      // Sem CPF novo (ou contato já tem CPF diferente) → apenas carregar
      if (!cpfDigitos) {
        return { tipo: "carregar", contato: porTel };
      }
      // Operador informou CPF mas o contato já tem outro CPF → tratar como conflito
      return { tipo: "conflito", cpfNome: "outro cliente", telNome: porTel.nome };
    }

    // Match só por CPF
    if (porCpf && !porTel) {
      if (telDigitos && !porCpf.telefone) {
        return {
          tipo: "juntar",
          proposta: {
            contato: porCpf,
            campo: "telefone",
            valorNovo: telDigitos,
            valorMatch: cpfDigitos,
          },
        };
      }
      if (!telDigitos) {
        return { tipo: "carregar", contato: porCpf };
      }
      return { tipo: "conflito", cpfNome: porCpf.nome, telNome: "outro cliente" };
    }

    return { tipo: "novo" };
  };

  const aplicarJuncao = async () => {
    if (!proposta || !profile?.tenant_id) return;
    setAplicandoJuncao(true);
    try {
      const update: { cpf?: string; telefone?: string } =
        proposta.campo === "cpf"
          ? { cpf: proposta.valorNovo }
          : { telefone: proposta.valorNovo };

      const { data: atualizado, error } = await supabase
        .from("contatos")
        .update(update)
        .eq("id", proposta.contato.id)
        .eq("tenant_id", profile.tenant_id)
        .select(SELECT_CONTATO)
        .single();

      if (error) {
        // Se houve violação de unicidade no UPDATE (telefone já existe em outro contato),
        // mostra erro claro e mantém modal aberto para correção.
        const code = (error as { code?: string }).code;
        if (code === "23505") {
          toast({
            title: "Não foi possível juntar",
            description:
              "Esse dado já pertence a outro cliente. Verifique antes de complementar o cadastro.",
            variant: "destructive",
          });
          setProposta(null);
          return;
        }
        throw error;
      }

      queryClient.invalidateQueries({ queryKey: ["contatos"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-contatos"] });

      toast({
        title: "✓ Cadastro complementado",
        description: `${(atualizado as ContatoCaixa).nome} agora tem ${
          proposta.campo === "cpf" ? "CPF" : "telefone"
        } cadastrado.`,
      });
      onCriado(atualizado as ContatoCaixa);
      setProposta(null);
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao complementar";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setAplicandoJuncao(false);
    }
  };

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
        onCriado(decisao.contato);
        onOpenChange(false);
        return;
      }

      if (decisao.tipo === "conflito") {
        setErros({
          cpf: "CPF e telefone pertencem a clientes diferentes",
          telefone: "Corrija um dos campos antes de continuar",
        });
        toast({
          title: "Dados de clientes diferentes",
          description: `O CPF é de "${decisao.cpfNome}" e o telefone é de "${decisao.telNome}". Ajuste um dos campos.`,
          variant: "destructive",
        });
        return;
      }

      if (decisao.tipo === "juntar") {
        setProposta(decisao.proposta);
        return;
      }

      // novo → INSERT
      const payload = {
        tenant_id: profile.tenant_id,
        nome: nome.trim(),
        telefone: telDigitos || null,
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
        .select(SELECT_CONTATO)
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
            onCriado(dec2.contato);
            onOpenChange(false);
            return;
          }
          if (dec2.tipo === "juntar") {
            setProposta(dec2.proposta);
            return;
          }
          if (dec2.tipo === "conflito") {
            toast({
              title: "Conflito de cadastro",
              description: "CPF e telefone pertencem a clientes diferentes.",
              variant: "destructive",
            });
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

  // Strings amigáveis para o AlertDialog de junção
  const propostaTexto = useMemo(() => {
    if (!proposta) return null;
    const campoMatch = proposta.campo === "cpf" ? "telefone" : "CPF";
    const valorMatchFmt =
      proposta.campo === "cpf"
        ? mascararTelefoneBR(proposta.valorMatch)
        : mascararCPF(proposta.valorMatch);
    const campoFalta = proposta.campo === "cpf" ? "CPF" : "telefone";
    const valorFaltaFmt =
      proposta.campo === "cpf"
        ? mascararCPF(proposta.valorNovo)
        : mascararTelefoneBR(proposta.valorNovo);
    return { campoMatch, valorMatchFmt, campoFalta, valorFaltaFmt };
  }, [proposta]);

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

      <AlertDialog
        open={!!proposta}
        onOpenChange={(o) => {
          if (!o && !aplicandoJuncao) setProposta(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cliente existente encontrado</AlertDialogTitle>
            <AlertDialogDescription>
              {proposta && propostaTexto && (
                <>
                  Encontramos <strong>{proposta.contato.nome}</strong> com{" "}
                  {propostaTexto.campoMatch}{" "}
                  <strong>{propostaTexto.valorMatchFmt}</strong>.
                  <br />
                  Deseja adicionar o {propostaTexto.campoFalta}{" "}
                  <strong>{propostaTexto.valorFaltaFmt}</strong> a esse cadastro?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={aplicandoJuncao}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void aplicarJuncao();
              }}
              disabled={aplicandoJuncao}
            >
              {aplicandoJuncao ? "Juntando..." : "Sim, juntar e continuar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
