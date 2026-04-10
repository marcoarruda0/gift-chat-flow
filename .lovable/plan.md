

# Corrigir Grupos Duplicados + Estilizar Ícones WhatsApp

## Problemas

### 1. Grupos separados/duplicados
**Causa raiz no webhook (linha 86-88):** O código faz `phone.replace(/\D/g, "")` que remove letras e pontos, transformando `5511999@g.us` em `5511999gus`. Depois verifica `phone.includes("g.us")` que **nunca é true** porque os caracteres `.` já foram removidos. Resultado: grupos não são detectados como grupos, e o `senderName` (nome de quem mandou a msg) é usado como nome do contato em vez do nome do grupo — criando um contato diferente para cada pessoa que envia mensagem no grupo.

**Correção:** Detectar grupo **antes** de limpar o telefone, usando o telefone original `payload.phone`.

### 2. Badge de não lidas (estilo WhatsApp)
Atualmente usa um `Badge` genérico. Na referência do WhatsApp, é um círculo verde com número branco.

### 3. Horário da última mensagem
Já está implementado (`formatTime` no `ConversaItem`), mas o estilo pode ser melhorado. Na referência do WhatsApp, o horário fica com cor verde quando há mensagens não lidas.

## Alterações

### `supabase/functions/zapi-webhook/index.ts`
- Mover a detecção de grupo para **antes** do `replace(/\D/g, "")`:
  ```
  const rawPhone = payload.phone || "";
  const isGroup = payload.isGroup === true || rawPhone.includes("@g.us");
  const phone = rawPhone.replace(/\D/g, "");
  ```
- Buscar contato existente pelo telefone original (sem strip) para grupos, mantendo strip para individuais
- Garantir que o nome do contato para grupo seja sempre `payload.chatName` ou `payload.senderName`

### `src/components/conversas/ConversaItem.tsx`
- Badge não lidas: círculo verde (#25D366) com texto branco, tamanho similar ao WhatsApp
- Horário: cor verde quando `naoLidas > 0`, cor muted quando zero
- Layout alinhado com a referência (horário à direita do nome, badge à direita do texto)

### `src/pages/Conversas.tsx` (sync)
- Mesma correção do `g.us`: detectar grupo antes do `replace(/\D/g, "")` na função `handleSync`
- Para grupos, não limpar o telefone (manter `@g.us` intacto) para que o contato seja encontrado corretamente

## Arquivos alterados
| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/zapi-webhook/index.ts` | Fix detecção de grupo (g.us antes do replace) |
| `src/components/conversas/ConversaItem.tsx` | Badge verde estilo WhatsApp + horário colorido |
| `src/pages/Conversas.tsx` | Fix sync de grupos (mesma correção g.us) |

