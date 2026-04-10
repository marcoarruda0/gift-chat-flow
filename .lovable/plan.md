

# Integrar AI Responder no Webhook WhatsApp

## Objetivo
Após salvar a mensagem do contato, o webhook chamará a edge function `ai-responder` para gerar uma resposta automática baseada na base de conhecimento e enviará essa resposta de volta via Z-API.

## Regras de Ativação
- **Somente mensagens de texto** (tipo "texto") — não responder a imagens, áudios, etc.
- **Somente conversas individuais** — não responder em grupos (`isGroup = false`)
- **Somente se `fromMe = false`** — não responder a mensagens enviadas pelo próprio número
- **Somente se houver artigos ativos na base** — se a IA retornar que não tem informação, não envia nada (evita respostas inúteis)

## Fluxo

```text
Mensagem recebida (webhook)
  → Salva no banco (já existe)
  → É texto + individual + não fromMe?
    → Sim → Chama ai-responder com { pergunta, tenant_id }
      → IA retornou resposta válida?
        → Sim → Busca zapi_config do tenant (instance_id, token, client_token)
          → Envia resposta via Z-API POST /send-text
          → Salva resposta como mensagem do "atendente" no banco
          → Atualiza ultimo_texto da conversa
        → Não → Não faz nada
    → Não → Não faz nada
```

## Alterações

### `supabase/functions/zapi-webhook/index.ts`
Após o bloco `console.log("Message saved for conversa:", conversa.id)` (linha 195), adicionar:

1. **Verificar condições**: `!isGroup && !payload.fromMe && messageType === "texto"`
2. **Chamar ai-responder** internamente (função direta, sem HTTP — reutilizar a lógica inline para evitar latência de chamada entre functions):
   - Buscar artigos ativos do tenant na `conhecimento_base`
   - Se não houver artigos → pular
   - Montar prompt e chamar Lovable AI Gateway
   - Se a resposta indicar "não tenho essa informação" → pular (não enviar)
3. **Enviar via Z-API**:
   - Buscar `instance_id`, `token`, `client_token` da `zapi_config`
   - POST para `https://api.z-api.io/instances/{id}/token/{token}/send-text` com `{ phone, message }`
4. **Salvar resposta no banco**:
   - Insert em `mensagens` com `remetente: "atendente"`, `tipo: "texto"`
   - Update `conversas.ultimo_texto` com a resposta

### Decisão: Inline vs chamada HTTP
A lógica da IA será implementada **inline no webhook** (copiando a lógica do ai-responder) para evitar latência extra de uma chamada HTTP entre edge functions. O `ai-responder` continuará existindo para uso manual/teste pela UI.

## Arquivos alterados
| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/zapi-webhook/index.ts` | Adicionar auto-resposta IA após salvar mensagem |

