## Objetivo

Permitir que templates WhatsApp Cloud tenham **cabeçalho de mídia (Imagem JPG/PNG ou Vídeo MP4)** além do já suportado TEXTO. A mídia será **fixa** — definida uma vez na criação do template e enviada igual para todos os destinatários, simplificando campanhas, conversas e regras de giftback.

## Como a Meta lida com isso

1. **Na criação** do template (`POST /message_templates`), o `HEADER` deve ter `format: "IMAGE" | "VIDEO"` + `example.header_handle: ["<URL pública de exemplo>"]`. Vamos passar a URL pública direta da mídia armazenada no nosso bucket `chat-media` (já existente e público).
2. **No envio** (`POST /messages`), o `header` parameter recebe `{ type: "image", image: { link: "<URL>" } }` ou `{ type: "video", video: { link: "<URL>" } }`.
3. Como a mídia é **fixa**, salvamos a URL dentro do próprio `components` do template no banco — sem necessidade de coluna extra ou input por destinatário.

---

## Mudanças

### 1. `CriarTemplateDialog.tsx` — formulário
- Adicionar `IMAGE` e `VIDEO` ao Select de tipo de cabeçalho (junto com `NONE` e `TEXT`).
- Quando `IMAGE`/`VIDEO` selecionado:
  - Mostrar componente de **upload** (input file) com validação:
    - **Imagem**: `image/jpeg`, `image/png`, máx **5MB** (limite Meta).
    - **Vídeo**: `video/mp4`, máx **16MB** (limite Meta).
  - Upload para `chat-media/template-headers/<tenant_id>/<uuid>.<ext>`, gravando a `publicUrl` em `headerMediaUrl`.
  - Preview inline da mídia carregada com botão "Remover/Trocar".
- Texto/exemplo de cabeçalho ficam ocultos quando o tipo é mídia (não há placeholders em mídia fixa).
- No `handleSubmit`, montar o componente HEADER apropriado:
  ```ts
  if (headerType === "IMAGE" || headerType === "VIDEO") {
    components.push({
      type: "HEADER",
      format: headerType, // "IMAGE" ou "VIDEO"
      example: { header_handle: [headerMediaUrl] },
      // campo customizado nosso (não vai pra Meta, mas fica no snapshot local)
      media_url: headerMediaUrl,
    });
  }
  ```
- Validação: bloquear submit se tipo for mídia mas nenhum arquivo carregado.

### 2. `enviar-campanha-cloud/index.ts` — envio em campanhas
Atualizar `buildTemplateComponents`:
```ts
if (type === "HEADER") {
  const format = String(comp.format || "TEXT").toUpperCase();
  if (format === "TEXT") { /* ... lógica atual ... */ }
  else if (format === "IMAGE" && comp.media_url) {
    out.push({ type: "header", parameters: [{ type: "image", image: { link: comp.media_url } }] });
  }
  else if (format === "VIDEO" && comp.media_url) {
    out.push({ type: "header", parameters: [{ type: "video", video: { link: comp.media_url } }] });
  }
}
```

### 3. `EnviarTemplateDialog.tsx` (conversas) — reaproveita media_url
- Detectar header de mídia e empilhar parameter automaticamente (sem input adicional pro usuário, pois a mídia é fixa).
- Mostrar preview da mídia acima do texto do template para o atendente saber o que vai enviar.
- O backend que envia mensagens template em conversas precisa ser ajustado da mesma forma → vou verificar e ajustar `whatsapp-cloud-proxy` ou onde o `EnviarTemplateDialog` posta os components.

### 4. `TemplateCampanhaPicker.tsx` (campanhas) — preview
- Renderizar miniatura da mídia (imagem com `<img>`, vídeo com `<video controls>`) acima do preview do corpo, quando o template tem header IMAGE/VIDEO.

### 5. `processar-comunicacoes-giftback/index.ts` — regras de giftback
- Mesma lógica de `buildTemplateComponents` precisa aceitar header IMAGE/VIDEO. Verificar se ele importa/duplica a função de `giftback-comunicacao.ts` e atualizar `montarComponentsTemplate` lá também (mantém paridade frontend/backend dos testes).

### 6. `src/lib/giftback-comunicacao.ts` — paridade
Atualizar `montarComponentsTemplate` para emitir header IMAGE/VIDEO quando `comp.media_url` estiver presente. Adicionar testes unitários cobrindo os dois novos formatos.

### 7. Sincronização (`TemplatesCard.handleSync`)
Quando puxamos templates já existentes da Meta, o `components` retornado tem `format: "IMAGE"` mas **sem** `media_url` (a Meta só guarda o handle interno). Solução:
- Preservar `media_url` se já existirmos localmente (merge no upsert) — caso contrário, marcar template como "mídia ausente" e exigir reupload antes de usar.
- Implementar via `select` prévio + merge antes do upsert, ou via SQL `coalesce` no upsert.

### 8. RLS / Storage
O bucket `chat-media` já é público — nada a mudar. Apenas confirmar que usuários autenticados conseguem fazer `upload` na pasta `template-headers/`. Se a policy atual restringir, adicionar policy permissiva para `INSERT` em `template-headers/<tenant_id>/*` (verifico durante implementação).

---

## Arquivos afetados

- **Editados**:
  - `src/components/whatsapp-oficial/CriarTemplateDialog.tsx` — UI de upload + montagem do componente.
  - `src/components/whatsapp-oficial/TemplatesCard.tsx` — preservar `media_url` no sync.
  - `src/components/conversas/EnviarTemplateDialog.tsx` — preview e auto-anexar header de mídia.
  - `src/components/campanhas/TemplateCampanhaPicker.tsx` — preview de mídia.
  - `supabase/functions/enviar-campanha-cloud/index.ts` — envio com header de mídia.
  - `supabase/functions/processar-comunicacoes-giftback/index.ts` — idem para giftback.
  - `src/lib/giftback-comunicacao.ts` — `montarComponentsTemplate` com IMAGE/VIDEO.
  - `src/lib/__tests__/giftback-comunicacao.test.ts` — novos testes.
- **Possível migração** (apenas se policy de storage bloquear): policy adicional em `storage.objects` para `chat-media/template-headers/`.

## Pontos de atenção

- Meta pode levar mais tempo para aprovar templates com mídia e às vezes rejeita por mídia de baixa qualidade — manter mensagem de aviso no dialog.
- URL precisa ser **HTTPS pública** (ok, bucket é público).
- Templates já existentes continuam funcionando (header TEXT/NONE) — a mudança é puramente aditiva.
