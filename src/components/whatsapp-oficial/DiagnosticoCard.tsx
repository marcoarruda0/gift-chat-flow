import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle2, XCircle, Clock, Loader2, AlertTriangle } from "lucide-react";

interface Props {
  ultimaVerificacaoAt: string | null;
  /** Última atividade POST do webhook (mensagens OU statuses) */
  ultimaAtividadeAt: string | null;
  /** Mensagens reais de cliente recebidas nas últimas 24h */
  msgsRecebidas24h: number;
  diagLoading: boolean;
  onRefresh: () => void;
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
}: Props) {
  const temAtividade = !!ultimaAtividadeAt;
  const temMsgReal = msgsRecebidas24h > 0;

  // 4-state diagnostic
  let statusColor: "destructive" | "secondary" | "default" = "destructive";
  let statusClass = "";
  let statusLabel = "Webhook nunca foi chamado pela Meta";
  let statusIcon = <XCircle className="h-3 w-3" />;
  let instrucao =
    "Configure Callback URL e Verify Token no painel da Meta (WhatsApp → Configuration) e clique em Verify and Save.";

  if (ultimaVerificacaoAt && !temAtividade) {
    // 🟡 Verificado mas Meta nunca enviou nenhum POST
    statusColor = "secondary";
    statusLabel = "Verificado, mas Meta não enviou nenhum evento";
    statusIcon = <Clock className="h-3 w-3" />;
    instrucao =
      "No Meta Dashboard → WhatsApp → Configuration → Webhook fields, clique em Manage e assine os campos `messages` e `message_status`. Depois clique no botão Test ao lado de `messages` para confirmar.";
  } else if (temAtividade && !temMsgReal) {
    // 🟠 Recebendo eventos (test/status) mas zero mensagem real de cliente
    statusColor = "secondary";
    statusClass = "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30 hover:bg-orange-500/15";
    statusLabel = "Recebendo eventos, mas sem mensagens reais de cliente";
    statusIcon = <AlertTriangle className="h-3 w-3" />;
    instrucao =
      "A Meta está chamando o webhook (test/status), mas nenhum cliente mandou mensagem ainda. Se o app está em modo Development, adicione seu número em API Setup → To (Recipient phone number) e mande uma mensagem do seu celular para o número oficial.";
  } else if (temMsgReal) {
    // 🟢 Tudo OK
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
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={diagLoading}>
            {diagLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Atualizar
          </Button>
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
