import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  Zap,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  Bell,
  ListChecks,
} from "lucide-react";

interface Props {
  ultimaVerificacaoAt: string | null;
  /** Última atividade POST do webhook (mensagens OU statuses) */
  ultimaAtividadeAt: string | null;
  /** Mensagens reais de cliente recebidas nas últimas 24h */
  msgsRecebidas24h: number;
  /** Eventos com status=erro nas últimas 24h */
  errosWebhook24h: number;
  /** Total de eventos nas últimas 24h (denominador da taxa) */
  totalEventos24h: number;
  /** Estado do HMAC: null=sem secret configurado, true=último válido, false=último inválido */
  hmacStatus: boolean | null;
  diagLoading: boolean;
  onRefresh: () => void;
  /** Re-assinar campo `messages` no WABA via Graph API */
  onSubscribeMessages?: () => void | Promise<void>;
  subscribing?: boolean;
  /** Reprocessa o último evento bruto recebido */
  onReprocessLast?: () => void | Promise<void>;
  reprocessing?: boolean;
  /** Limite percentual configurável de erro (0-100) */
  alertaTaxaErroPct: number;
  /** Quantidade mínima de eventos em 24h para considerar o cálculo */
  alertaMinEventos: number;
  /** Salvar configuração de alerta */
  onSaveAlertaConfig?: (taxaPct: number, minEventos: number) => void | Promise<void>;
  savingAlerta?: boolean;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "nunca";
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `há ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

export function DiagnosticoCard({
  ultimaVerificacaoAt,
  ultimaAtividadeAt,
  msgsRecebidas24h,
  errosWebhook24h,
  totalEventos24h,
  hmacStatus,
  diagLoading,
  onRefresh,
  onSubscribeMessages,
  subscribing,
  onReprocessLast,
  reprocessing,
  alertaTaxaErroPct,
  alertaMinEventos,
  onSaveAlertaConfig,
  savingAlerta,
}: Props) {
  const temAtividade = !!ultimaAtividadeAt;
  const temMsgReal = msgsRecebidas24h > 0;
  const taxaSucesso =
    totalEventos24h > 0
      ? Math.round(((totalEventos24h - errosWebhook24h) / totalEventos24h) * 100)
      : null;
  const taxaErro =
    totalEventos24h > 0 ? (errosWebhook24h / totalEventos24h) * 100 : 0;
  const alertaAtivo =
    totalEventos24h >= alertaMinEventos && taxaErro > alertaTaxaErroPct;

  let statusColor: "destructive" | "secondary" | "default" = "destructive";
  let statusClass = "";
  let statusLabel = "Webhook nunca foi chamado pela Meta";
  let statusIcon = <XCircle className="h-3 w-3" />;
  let instrucao =
    "Configure Callback URL e Verify Token no painel da Meta (WhatsApp → Configuration) e clique em Verify and Save.";
  let mostrarChecklist = false;

  if (ultimaVerificacaoAt && !temAtividade) {
    statusColor = "secondary";
    statusLabel = "Verificado, mas Meta não enviou nenhum evento";
    statusIcon = <Clock className="h-3 w-3" />;
    instrucao =
      "O handshake de verificação funcionou, mas a Meta nunca disparou um POST. Causas mais prováveis abaixo:";
    mostrarChecklist = true;
  } else if (temAtividade && !temMsgReal) {
    statusColor = "secondary";
    statusClass =
      "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30 hover:bg-orange-500/15";
    statusLabel = "Recebendo eventos, mas sem mensagens reais de cliente";
    statusIcon = <AlertTriangle className="h-3 w-3" />;
    instrucao =
      "A Meta está chamando o webhook (test/status), mas nenhum cliente mandou mensagem ainda. Se o app está em modo Development, adicione seu número em API Setup → To (Recipient phone number) e mande uma mensagem do seu celular para o número oficial.";
  } else if (temMsgReal) {
    statusColor = "default";
    statusLabel = "Recebendo mensagens normalmente";
    statusIcon = <CheckCircle2 className="h-3 w-3" />;
    instrucao = "";
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Diagnóstico do Webhook</CardTitle>
            <CardDescription>
              Confirma se a Meta está realmente chamando o nosso endpoint
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {onReprocessLast && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onReprocessLast()}
                disabled={reprocessing}
              >
                {reprocessing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <RotateCcw className="h-4 w-4 mr-1" />
                )}
                Reprocessar último
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={diagLoading}>
              {diagLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Atualizar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={statusColor} className={`gap-1 ${statusClass}`}>
            {statusIcon}
            {statusLabel}
          </Badge>
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
            <Link to="/configuracoes/whatsapp-oficial/eventos">
              <ListChecks className="h-3 w-3 mr-1" />
              Ver eventos
            </Link>
          </Button>
        </div>

        {alertaAtivo && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 flex gap-2 items-start">
            <Bell className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 text-sm">
              <p className="font-medium text-destructive">
                Taxa de erro acima do limite ({alertaTaxaErroPct}%)
              </p>
              <p className="text-destructive/90 text-xs mt-0.5">
                {errosWebhook24h} de {totalEventos24h} eventos falharam nas últimas 24h (
                {taxaErro.toFixed(1)}%). Verifique a página de eventos para investigar.
              </p>
            </div>
          </div>
        )}

        {instrucao && (
          <p className="text-sm text-muted-foreground border-l-2 border-primary/40 pl-3">
            {instrucao}
          </p>
        )}

        {mostrarChecklist && (
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
            <p className="text-sm font-medium">Causas mais prováveis</p>
            <ol className="space-y-2 text-sm text-muted-foreground list-decimal pl-5">
              <li>
                O campo <code className="bg-muted px-1 rounded text-xs">messages</code> não
                está assinado no WABA (mais comum). Use o botão abaixo para assinar
                automaticamente.
              </li>
              <li>
                O App está em modo <strong>Development</strong> e o número remetente não está
                na allowlist em <em>API Setup → To</em>.
              </li>
              <li>
                A Callback URL salva no Meta Dashboard aponta pra outro App ou outro projeto.
                Confira que é exatamente a URL mostrada acima.
              </li>
            </ol>

            {onSubscribeMessages && (
              <div className="pt-2">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => onSubscribeMessages()}
                  disabled={subscribing}
                >
                  {subscribing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Zap className="h-4 w-4 mr-1" />
                  )}
                  Re-assinar campo "messages" automaticamente
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Equivalente a clicar em "Subscribe" no painel da Meta.
                </p>
              </div>
            )}
          </div>
        )}

        {/* HMAC status */}
        <div className="flex items-center gap-2 pt-2 border-t">
          {hmacStatus === null ? (
            <Badge variant="secondary" className="gap-1">
              <ShieldOff className="h-3 w-3" />
              HMAC desativado (sem META_APP_SECRET)
            </Badge>
          ) : hmacStatus ? (
            <Badge
              variant="default"
              className="gap-1 bg-primary/15 text-primary border-primary/30 hover:bg-primary/15"
            >
              <ShieldCheck className="h-3 w-3" />
              HMAC válido no último evento
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <ShieldAlert className="h-3 w-3" />
              HMAC inválido — verifique o App Secret
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-2 border-t">
          <div>
            <p className="text-xs text-muted-foreground">Última verificação</p>
            <p className="text-sm font-medium">{formatRelative(ultimaVerificacaoAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Última atividade</p>
            <p className="text-sm font-medium">{formatRelative(ultimaAtividadeAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Msgs reais (24h)</p>
            <p className="text-sm font-medium">{msgsRecebidas24h}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Erros webhook (24h)</p>
            <p
              className={`text-sm font-medium ${
                errosWebhook24h > 0 ? "text-destructive" : ""
              }`}
            >
              {errosWebhook24h}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Taxa de sucesso</p>
            <p className="text-sm font-medium">
              {taxaSucesso === null ? "—" : `${taxaSucesso}%`}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
