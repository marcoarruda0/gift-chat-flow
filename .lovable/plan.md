

# Importação de Conversas via HTML + Mídia (Wondershare MobileTrans)

## Análise do formato HTML

A estrutura do Wondershare foi mapeada com sucesso:

```text
Estrutura do export:
  ExportMedia/20260413213850/
  ├── +55 11 94582-7111.html        ← arquivo principal
  ├── 064646f1-...m4a               ← áudio
  ├── 6f674841-...jpg               ← imagem (+ thumbnail separado)
  ├── Cadastro_...pdf               ← documento
  ├── Video52620251651              ← vídeo (sem extensão)
  ├── Unknown112020241045           ← stickers/figurinhas
  ├── IconAudio.png, IconPDF.png... ← ícones do Wondershare (ignorar)
  └── ...
```

**Padrões HTML identificados:**
- **Telefone**: extraído do `<h3>` no header
- **Mensagem do contato** (recebida): `class='triangle-isosceles'` — texto direto dentro do `<p>`
- **Mensagem do atendente** (enviada): `class='triangle-isosceles2'` — com padrão `*NOME:*<br>` para identificar o atendente
- **Timestamp**: `<p class='date'><font color='#b4b4b4'>2024/11/20 10:44</font></p>`
- **Mídia**: `<table class='triangle-isosceles-map' ou 'map2'>` com `<a href='file:///...filename'>` — tipo detectável pela extensão (`.m4a`=audio, `.jpg/.png`=imagem, `.pdf`=documento, `Video*`=vídeo, `Unknown*`=sticker/desconhecido)

## Plano de implementação

### 1. Nova Edge Function: `importar-conversas-html`
Parser HTML server-side que:
- Extrai telefone do `<h3>`
- Itera pelas `<p>` e `<table>` para extrair mensagens e referências de mídia
- Para cada mensagem de mídia, salva o **nome do arquivo esperado** no campo `metadata` (ex: `{ importado: true, media_filename: "064646f1-...m4a", media_tipo: "audio" }`)
- Mensagens de texto: `tipo = "texto"`
- Mensagens de mídia sem arquivo enviado ainda: `tipo = "imagem"|"audio"|"video"|"documento"`, `conteudo = "[Áudio]"|"[Imagem]"|"[Vídeo]"|"[Documento]"`, metadata com filename
- Mesma lógica de dedup, contato, conversa que a edge function atual
- Retorna lista de `media_filenames` pendentes para o frontend saber quais mídias enviar

### 2. Nova Edge Function: `upload-midia-importada`
Recebe arquivos de mídia individualmente (ou em batch):
- Recebe `conversa_id` + arquivo via FormData
- Faz upload para o bucket `chat-media` em `{tenant_id}/importados/{conversa_id}/{filename}`
- Busca a mensagem correspondente pelo `metadata->media_filename` e atualiza o `conteudo` com a URL pública do storage
- Retorna sucesso/erro por arquivo

### 3. Atualizar `ImportarConversasDialog.tsx`
Fluxo em 2 etapas:

**Etapa 1 — HTML:**
- Aceitar `.html` (além de `.txt` para retrocompatibilidade)
- Preview extrai telefone e conta mensagens do HTML no client-side
- Envia o conteúdo HTML para `importar-conversas-html`
- Recebe de volta a lista de `media_filenames` pendentes

**Etapa 2 — Mídia (opcional):**
- Após importar o HTML, mostra seção "Enviar mídias" com a lista de arquivos esperados
- Usuário seleciona a pasta de mídia (ou arquivos individuais)
- Sistema faz match por nome de arquivo e envia para `upload-midia-importada`
- Progress bar para uploads de mídia
- Mídias não encontradas ficam como placeholder `[Áudio]`, `[Imagem]`, etc.

### 4. Atualizar `MessageBubble.tsx`
- Renderizar mensagens importadas de mídia que ainda não têm URL como placeholder (ícone + texto "[Áudio pendente]")
- Renderizar mensagens com URL de mídia normalmente (imagem inline, player de áudio, link para PDF/vídeo)

### Arquivos afetados

| Arquivo | Ação |
|---------|------|
| `supabase/functions/importar-conversas-html/index.ts` | **Criar** — parser HTML + insert mensagens |
| `supabase/functions/upload-midia-importada/index.ts` | **Criar** — upload de mídia + link com mensagem |
| `src/components/conversas/ImportarConversasDialog.tsx` | **Reescrever** — fluxo 2 etapas (HTML + mídia) |
| `src/components/conversas/MessageBubble.tsx` | **Atualizar** — renderizar mídias importadas |

### Limitações e decisões
- Arquivos `Unknown*` e stickers serão importados como tipo "documento" com placeholder
- Vídeos sem extensão (ex: `Video52620251651`) serão detectados pelo prefixo `Video` no nome
- Mídia é opcional — o usuário pode importar só o texto e enviar mídias depois (ou nunca)
- Limite de 20MB por arquivo de mídia (limite do storage)
- A edge function `.txt` existente continua funcionando para retrocompatibilidade

