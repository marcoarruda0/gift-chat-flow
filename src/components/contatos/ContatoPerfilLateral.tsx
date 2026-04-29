import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import RfvBadge from "@/components/giftback/RfvBadge";
import {
  Mail,
  Phone,
  MapPin,
  MessageSquare,
  Gift,
  ShoppingBag,
  CheckCircle2,
  Ban,
  ChevronDown,
  Megaphone,
} from "lucide-react";
import { format } from "date-fns";

interface ContatoPerfilLateralProps {
  contato: any;
  onConversar: () => void;
  onToggleOptOut: () => void;
}

export function ContatoPerfilLateral({
  contato,
  onConversar,
  onToggleOptOut,
}: ContatoPerfilLateralProps) {
  const navigate = useNavigate();

  const { data: resumo } = useQuery({
    queryKey: ["contato-resumo-lateral", contato.id],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("contato_resumo", {
        p_contato_id: contato.id,
      });
      return data;
    },
    enabled: !!contato.id,
  });

  const initials = (contato.nome || "?")
    .split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const optOut = !!contato.opt_out_whatsapp;
  const vendedor = resumo?.vendedor_principal && resumo.vendedor_principal !== null
    ? resumo.vendedor_principal
    : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Card principal */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3 mb-3">
          <Avatar className="h-14 w-14">
            <AvatarImage src={contato.avatar_url || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary font-semibold text-lg">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-base text-primary truncate">
              {contato.nome}
            </h2>
          </div>
        </div>

        <div className="space-y-2 text-sm mb-3">
          <InfoLine
            icon={Mail}
            value={contato.email}
            placeholder="vazio"
          />
          <InfoLine
            icon={Phone}
            value={contato.telefone}
            placeholder="vazio"
          />
          <InfoLine
            icon={MapPin}
            value={contato.endereco}
            placeholder="vazio"
          />
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {contato.rfv_recencia != null && (
            <RfvBadge
              r={contato.rfv_recencia}
              f={contato.rfv_frequencia}
              v={contato.rfv_valor}
              compacto
            />
          )}
          {Number(contato.saldo_giftback) > 0 && (
            <Badge variant="secondary" className="text-xs">
              <Gift className="h-3 w-3 mr-1" />
              {Number(contato.saldo_giftback).toFixed(2).replace(".", ",")}
            </Badge>
          )}
        </div>

        {/* Status opt-in */}
        <div className="flex items-center gap-2 text-sm mb-3 pt-3 border-t border-border">
          <span
            className={`h-2 w-2 rounded-full ${
              optOut ? "bg-destructive" : "bg-emerald-500"
            }`}
          />
          <span className="text-muted-foreground">
            {optOut ? "Não recebe mensagens" : "Aceita receber mensagens"}
          </span>
        </div>

        {/* Botões rápidos */}
        <div className="grid grid-cols-4 gap-2">
          <QuickButton
            icon={MessageSquare}
            title="Conversar"
            onClick={onConversar}
          />
          <QuickButton
            icon={optOut ? CheckCircle2 : Ban}
            title={optOut ? "Reativar opt-in" : "Marcar opt-out"}
            onClick={onToggleOptOut}
          />
          <QuickButton
            icon={ShoppingBag}
            title="Ver compras"
            onClick={() => navigate(`/giftback/caixa?contato=${contato.id}`)}
          />
          <QuickButton
            icon={Megaphone}
            title="Ver campanhas"
            onClick={() => navigate(`/campanhas`)}
          />
        </div>
      </div>

      {/* Sobre */}
      <Collapsible defaultOpen>
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <CollapsibleTrigger className="w-full flex items-center justify-between p-3 group">
            <span className="font-semibold text-sm text-foreground">Sobre</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4 space-y-3 text-sm">
              <InfoBlock label="Endereço" value={contato.endereco} />
              <InfoBlock
                label="Aniversário"
                value={
                  contato.data_nascimento
                    ? format(new Date(contato.data_nascimento), "dd/MM/yyyy")
                    : null
                }
              />
              <InfoBlock label="Gênero" value={formatGenero(contato.genero)} />
              <InfoBlock label="CPF" value={contato.cpf} />
              <div>
                <div className="text-xs font-medium text-foreground mb-1">
                  Perfil RFM:
                </div>
                {contato.rfv_recencia != null ? (
                  <RfvBadge
                    r={contato.rfv_recencia}
                    f={contato.rfv_frequencia}
                    v={contato.rfv_valor}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">vazio</span>
                )}
              </div>
              <InfoBlock
                label="Vendedor principal"
                value={vendedor?.nome}
              />
              {contato.tags && contato.tags.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-foreground mb-1">
                    Tags:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {contato.tags.map((t: string) => (
                      <Badge key={t} variant="secondary" className="text-[10px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {contato.notas && (
                <InfoBlock label="Notas" value={contato.notas} multiline />
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Campos personalizados */}
      {contato.campos_personalizados &&
        Object.keys(contato.campos_personalizados).length > 0 && (
          <Collapsible>
            <div className="rounded-lg border border-border bg-card shadow-sm">
              <CollapsibleTrigger className="w-full flex items-center justify-between p-3 group">
                <span className="font-semibold text-sm text-foreground">
                  Campos personalizados
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 space-y-2">
                  {Object.entries(contato.campos_personalizados).map(([k, v]) => (
                    <InfoBlock key={k} label={k} value={String(v)} />
                  ))}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        )}
    </div>
  );
}

function InfoLine({
  icon: Icon,
  value,
  placeholder,
}: {
  icon: any;
  value: string | null;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span
        className={value ? "text-foreground truncate" : "text-muted-foreground italic"}
      >
        {value || placeholder}
      </span>
    </div>
  );
}

function InfoBlock({
  label,
  value,
  multiline,
}: {
  label: string;
  value: any;
  multiline?: boolean;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-foreground mb-0.5">{label}:</div>
      <div
        className={`text-xs ${
          value ? "text-foreground" : "text-muted-foreground italic"
        } ${multiline ? "whitespace-pre-wrap" : ""}`}
      >
        {value || "vazio"}
      </div>
    </div>
  );
}

function QuickButton({
  icon: Icon,
  title,
  onClick,
}: {
  icon: any;
  title: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="outline"
      size="icon"
      className="h-10 w-full bg-primary/5 border-primary/20 hover:bg-primary/10 text-primary"
      title={title}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

function formatGenero(g: string | null): string | null {
  if (!g) return null;
  const map: Record<string, string> = {
    masculino: "Masculino",
    feminino: "Feminino",
    outro: "Outro",
    nao_informado: "Não informado",
  };
  return map[g] || g;
}
