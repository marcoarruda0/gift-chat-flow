

# Mensagens de Disparo Visíveis no Módulo Conversas

## Problema
A edge function `enviar-campanha` envia a mensagem via Z-API mas não registra nada nas tabelas `mensagens` nem `conversas`. Resultado: a mensagem é enviada pelo WhatsApp mas não aparece no módulo de conversas.

## Solução
Após cada envio bem-sucedido via Z-API, a função deve:

1. **Buscar ou criar uma conversa** para o contato do destinatário
2. **Inserir a mensagem na tabela `mensagens`** com remetente `"atendente"` e o conteúdo enviado
3. **Atualizar a conversa** com `ultimo_texto` e `ultima_msg_at`

## Alteração

### `supabase/functions/enviar-campanha/index.ts`

Dentro do bloco `if (zapiResponse.ok)` (após marcar o destinatário como "enviado"), adicionar:

```typescript
// 1. Find or create conversation for this contact
let conversaId: string;
const { data: existingConv } = await serviceClient
  .from("conversas")
  .select("id")
  .eq("tenant_id", campanha.tenant_id)
  .eq("contato_id", dest.contato_id)
  .eq("status", "aberta")
  .limit(1)
  .maybeSingle();

if (existingConv) {
  conversaId = existingConv.id;
} else {
  const { data: newConv } = await serviceClient
    .from("conversas")
    .insert({
      tenant_id: campanha.tenant_id,
      contato_id: dest.contato_id,
      status: "aberta",
    })
    .select("id")
    .single();
  conversaId = newConv!.id;
}

// 2. Insert message
const tipoMsg = tipoMidia === "texto" ? "texto" : tipoMidia;
await serviceClient.from("mensagens").insert({
  conversa_id: conversaId,
  tenant_id: campanha.tenant_id,
  conteudo: mensagemFinal,
  remetente: "atendente",
  tipo: tipoMsg,
  metadata: { fromCampanha: campanha.nome },
});

// 3. Update conversation preview
await serviceClient.from("conversas").update({
  ultimo_texto: "Campanha: " + mensagemFinal.slice(0, 80),
  ultima_msg_at: new Date().toISOString(),
}).eq("id", conversaId);
```

- O `metadata.fromCampanha` permite identificar visualmente que a mensagem veio de um disparo (futuro, se desejado)
- O `remetente` é `"atendente"` para que apareça como mensagem enviada (bolha do lado direito)
- Para mídia (imagem, áudio, documento), o `conteudo` será a URL da mídia, e o `tipo` será o tipo correspondente

## Arquivos

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/enviar-campanha/index.ts` | Registrar mensagem e conversa após envio bem-sucedido |

