import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";

interface Props {
  ultimaVerificacaoAt: string | null;
  ultimaMensagemAt: string | null;
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
  ultimaMensagemAt,
  msgsRecebidas24h,
  diagLoading,
  onRefresh,
}: Props) {
  const recebeuMsgRecente =
    ultimaMensagemAt &&
    Date.now() - new Date(ultimaMensagemAt).getTime() < 24 * 60 * 60 * 1000;

  let statusColor: "destructive" | "secondary" | "default" = "destructive";
  let statusLabel = "Webhook nunca foi chamado pela Meta";
  let statusIcon = <XCircle className="h-3 w-3" />;
  let instrucao =
    "Configure Callback URL e Verify Token no painel da Meta (WhatsApp → Configuration) e clique em Verify and Save.";

  if (ultimaVerificacaoAt && !recebeuMsgRecente) {
    statusColor = "secondary";
    statusLabel = "Verificado, mas sem mensagens recebidas";
    statusIcon = <Clock className="h-3 w-3" />;
    instrucao =
      "Em Webhook fields → Manage, assine os campos `messages` e `message_status`. Se o app estiver em modo Development, adicione seu número em API Setup → To.";
  } else if (recebeuMsgRecente) {
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
          <Badge variant={statusColor} className="gap-1">
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
            <p className="text-xs text-muted-foreground">Última verificação</p>
            <p className="text-sm font-medium">{formatRelative(ultimaVerificacaoAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Última mensagem recebida</p>
            <p className="text-sm font-medium">{formatRelative(ultimaMensagemAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Mensagens nas últimas 24h</p>
            <p className="text-sm font-medium">{msgsRecebidas24h}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
