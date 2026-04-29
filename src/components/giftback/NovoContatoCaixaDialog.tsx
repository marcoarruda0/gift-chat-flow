import { useEffect, useState } from "react";
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
  mascararCPF,
  mascararTelefoneBR,
  validarCPF,
  validarTelefoneBR,
} from "@/lib/br-format";

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

export function NovoContatoCaixaDialog({ open, onOpenChange, valorBuscado, onCriado }: Props) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState(""); // valor mascarado
  const [telefone, setTelefone] = useState(""); // valor mascarado
  const [email, setEmail] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  // Pré-preenche CPF (se for CPF válido) ou telefone, já aplicando máscara
  useEffect(() => {
    if (!open) return;
    setNome("");
    setEmail("");
    setDataNascimento("");
    setErros({});
    const limpo = valorBuscado.trim();
    if (ehProvavelCPF(limpo)) {
      setCpf(mascararCPF(limpo));
      setTelefone("");
    } else {
      setTelefone(mascararTelefoneBR(limpo));
      setCpf("");
    }
  }, [open, valorBuscado]);

  const handleCpfChange = (v: string) => setCpf(mascararCPF(v));
  const handleTelChange = (v: string) => setTelefone(mascararTelefoneBR(v));

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
      // Verificar duplicidade por CPF ou telefone (usando dígitos)
      const filtros: string[] = [];
      if (cpfDigitos) filtros.push(`cpf.eq.${cpfDigitos}`);
      if (telDigitos) filtros.push(`telefone.eq.${telDigitos}`);

      if (filtros.length > 0) {
        const { data: existente } = await supabase
          .from("contatos")
          .select("id, nome, telefone, cpf, saldo_giftback, rfv_recencia, rfv_frequencia, rfv_valor")
          .or(filtros.join(","))
          .maybeSingle();
        if (existente) {
          toast({
            title: "Cliente já cadastrado",
            description: "Carregando o cadastro existente.",
          });
          onCriado(existente as ContatoCaixa);
          onOpenChange(false);
          return;
        }
      }

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
        .select(
          "id, nome, telefone, cpf, saldo_giftback, rfv_recencia, rfv_frequencia, rfv_valor",
        )
        .single();

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["contatos"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-contatos"] });

      toast({ title: "Cliente cadastrado!" });
      onCriado(criado as ContatoCaixa);
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao cadastrar";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  return (
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
            />
            {erros.email && <p className="text-xs text-destructive mt-1">{erros.email}</p>}
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
          <Button onClick={handleSalvar} disabled={salvando}>
            {salvando ? "Salvando..." : "Cadastrar e continuar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
