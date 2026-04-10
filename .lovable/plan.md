

# Receber Mídia (Imagens, Documentos, Áudio) no Webhook

## Problemas Identificados

### 1. Webhook ignora mensagens de mídia
O webhook atual (linha 54) só processa mensagens com `payload.text?.message`. Quando o WhatsApp envia imagem, documento, áudio ou vídeo, o Z-API envia payloads com campos diferentes:
- **Imagem**: `payload.image.imageUrl` + `payload.image.caption`
- **Documento**: `payload.document.documentUrl` + `payload.document.fileName`
- **Áudio**: `payload.audio.audioUrl`
- **Vídeo**: `payload.video.videoUrl`
- **Sticker**: `payload.sticker.stickerUrl`

Como o webhook só verifica `payload.text?.message`, todas essas mensagens são ignoradas silenciosamente.

### 2. Horário no menu lateral
Já está implementado em `ConversaItem.tsx` (linha 45). Aparece à direita do nome do contato. Se não está visível, pode ser porque `ultima_msg_at` está nulo em algumas conversas — o que seria corrigido pela correção do webhook (que passará a atualizar `ultima_msg_at` para mensagens de mídia também).

## Alterações

### `supabase/functions/zapi-webhook/index.ts`
Refatorar a lógica de detecção de mensagem para extrair conteúdo de qualquer tipo:

```
// Antes da lógica de contato/conversa, determinar tipo e conteúdo:
let messageText = null;
let messageType = "texto";
let messageContent = null;

if (payload.text?.message) {
  messageText = payload.text.message;
  messageType = "texto";
  messageContent = payload.text.message;
} else if (payload.image) {
  messageType = "imagem";
  messageContent = payload.image.imageUrl || payload.image.thumbnailUrl;
  messageText = payload.image.caption || "📷 Imagem";
} else if (payload.document) {
  messageType = "documento";
  messageContent = payload.document.documentUrl;
  messageText = "📎 " + (payload.document.fileName || "Documento");
} else if (payload.audio) {
  messageType = "audio";
  messageContent = payload.audio.audioUrl;
  messageText = "🎤 Áudio";
} else if (payload.video) {
  messageType = "imagem"; // reusar tipo imagem para vídeo por enquanto
  messageContent = payload.video.videoUrl;
  messageText = "🎬 Vídeo";
} else if (payload.sticker) {
  messageType = "imagem";
  messageContent = payload.sticker.stickerUrl;
  messageText = "Sticker";
}
```

- Trocar a condição `if (payload.phone && payload.text?.message)` por `if (payload.phone && messageContent)`
- Salvar `messageContent` como `conteudo` e `messageType` como `tipo` na mensagem
- Usar `messageText` para o `ultimo_texto` da conversa (preview no menu lateral)

Resultado: imagens, documentos, áudios e vídeos recebidos via WhatsApp aparecerão na conversa e o preview será atualizado corretamente no menu lateral.

## Arquivos alterados
| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/zapi-webhook/index.ts` | Detectar e processar mensagens de mídia (imagem, documento, áudio, vídeo) |

