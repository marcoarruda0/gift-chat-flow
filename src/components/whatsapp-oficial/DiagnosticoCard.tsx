import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle2, XCircle, Clock, Loader2, AlertTriangle, Zap, RotateCcw, ShieldCheck, ShieldAlert, ShieldOff } from "lucide-react";

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
  diagLoading,
  onRefresh,
  onSubscribeMessages,
  subscribing,
  onReprocessLast,
  reprocessing,
}: Props) {
  const temAtividade = !!ultimaAtividadeAt;
  const temMsgReal = msgsRecebidas24h > 0;

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
        <div className="flex items-center gap-2">
          <Badge variant={statusColor} className={`gap-1 ${statusClass}`}>
            {statusIcon}
            {statusLabel}
          </Badge>
        </div>

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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t">
          <div>
            <p className="text-xs text-muted-foreground">Última verificação (GET)</p>
            <p className="text-sm font-medium">{formatRelative(ultimaVerificacaoAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Última atividade (POST)</p>
            <p className="text-sm font-medium">{formatRelative(ultimaAtividadeAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Mensagens reais (24h)</p>
            <p className="text-sm font-medium">{msgsRecebidas24h}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
