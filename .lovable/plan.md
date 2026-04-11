

# Suporte a Mídia nas Campanhas de Disparos

## Objetivo
Permitir que campanhas enviem imagens, áudio, vídeos e documentos além de texto, usando os endpoints da Z-API para cada tipo de mídia.

## Alterações

### 1. Migration — Adicionar colunas de mídia na tabela `campanhas`
- `tipo_midia` (text, default `'texto'`) — valores: `texto`, `imagem`, `audio`, `video`, `documento`
- `midia_url` (text, nullable) — URL do arquivo de mídia (armazenado no bucket `chat-media`)

### 2. UI — `src/pages/Disparos.tsx`
- Adicionar seletor de tipo de mídia (Select: Texto, Imagem, Áudio, Vídeo, Documento)
- Quando tipo ≠ texto: exibir input de upload de arquivo com preview
- Upload do arquivo para o bucket `chat-media` (já existente e público)
- Mensagem de texto vira "legenda" (caption) quando há mídia
- Na lista de campanhas, exibir ícone indicando o tipo de mídia

### 3. Edge Function — `enviar-campanha/index.ts`
- Ler `tipo_midia` e `midia_url` da campanha
- Selecionar endpoint Z-API correto:
  - `texto` → `send-text` (atual)
  - `imagem` → `send-image` com `{ phone, image: url, caption }`
  - `audio` → `send-audio` com `{ phone, audio: url }`
  - `video` → `send-video` com `{ phone, video: url, caption }`
  - `documento` → `send-document` com `{ phone, document: url, fileName, caption }`
- Substituir variáveis `{nome}` e `{telefone}` no caption/mensagem

## Arquivos criados/alterados

| Arquivo | Tipo |
|---------|------|
| Migration (tipo_midia + midia_url) | Novo |
| `src/pages/Disparos.tsx` | Alterado (upload + seletor tipo) |
| `supabase/functions/enviar-campanha/index.ts` | Alterado (endpoints por tipo) |

## Detalhes Técnicos

- O bucket `chat-media` já é público, então a URL gerada pelo Supabase Storage é acessível pela Z-API
- Para áudio, Z-API aceita MP3/OGG; para vídeo, MP4; para documento, PDF/DOCX/etc
- O caption (legenda) continua suportando variáveis `{nome}` e `{telefone}`

