

# Funcionalidades de Mídia no Módulo Conversas

## 1. Gravação de Áudio

### `src/components/conversas/AudioRecorder.tsx` (novo)
- Componente com botão de microfone que usa `navigator.mediaDevices.getUserMedia({ audio: true })` e `MediaRecorder` API
- Estados: idle → recording → sending
- Ao parar gravação, converte para Blob (webm/ogg), faz upload para Storage e envia via Z-API endpoint `send-audio`
- Indicador visual de gravação (ícone pulsante, timer)

### Storage bucket
- Criar bucket `chat-media` (público) via migration para armazenar áudios, imagens e documentos

## 2. Envio de Anexos (Fotos/Documentos)

### `src/components/conversas/AttachmentButton.tsx` (novo)
- Botão de clipe que abre file picker
- Aceita imagens (jpg, png, webp) e documentos (pdf, doc, xlsx, etc.)
- Faz upload para bucket `chat-media`, salva mensagem com `tipo: "imagem"` ou `tipo: "documento"`
- Envia via Z-API endpoints `send-image` (com `image` URL) ou `send-document` (com `document` URL)

## 3. Atualizar ChatInput

### `src/components/conversas/ChatInput.tsx`
- Adicionar `AttachmentButton` (clipe) e `AudioRecorder` (microfone) ao lado do botão enviar
- Props: `onSendAudio(blob)`, `onSendAttachment(file)`

## 4. Atualizar ChatPanel e Conversas.tsx

### `src/components/conversas/ChatPanel.tsx`
- Passar novos handlers `onSendAudio` e `onSendAttachment` para `ChatInput`

### `src/pages/Conversas.tsx`
- Implementar `handleSendAudio`: upload para Storage → insert mensagem tipo "audio" → enviar via Z-API `send-audio`
- Implementar `handleSendAttachment`: upload para Storage → insert mensagem tipo "imagem"/"documento" → enviar via Z-API `send-image`/`send-document`

## 5. Renderizar Mídia no MessageBubble

### `src/components/conversas/MessageBubble.tsx`
- Receber prop `tipo` além de `conteudo`
- Se `tipo === "audio"`: renderizar `<audio>` player
- Se `tipo === "imagem"`: renderizar `<img>` com preview clicável
- Se `tipo === "documento"`: renderizar link de download com ícone de arquivo
- Texto continua como está

## 6. Fotos de Perfil na Lista de Conversas

### `src/components/conversas/ConversaItem.tsx`
- Já suporta `avatarUrl` e `AvatarImage` — funciona se o `avatar_url` estiver preenchido no contato
- O sync já salva `profilePicture` da Z-API no campo `avatar_url`
- Nenhuma alteração necessária neste componente (já implementado)

### Verificação
- Se as fotos não aparecem, pode ser que o sync não foi executado ou os contatos foram criados manualmente sem foto
- O botão "Sincronizar WhatsApp" já atualiza `avatar_url` com `chat.profilePicture`

## Migration necessária
```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-media', 'chat-media', true);

CREATE POLICY "tenant_upload_chat_media" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-media');

CREATE POLICY "public_read_chat_media" ON storage.objects
FOR SELECT USING (bucket_id = 'chat-media');
```

## Arquivos alterados/criados
| Arquivo | Tipo |
|---------|------|
| `src/components/conversas/AudioRecorder.tsx` | Novo |
| `src/components/conversas/AttachmentButton.tsx` | Novo |
| `src/components/conversas/ChatInput.tsx` | Alterado |
| `src/components/conversas/ChatPanel.tsx` | Alterado |
| `src/components/conversas/MessageBubble.tsx` | Alterado |
| `src/pages/Conversas.tsx` | Alterado |
| Migration para bucket `chat-media` | Novo |

