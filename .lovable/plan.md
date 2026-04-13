

# Corrigir Recebimento de Respostas de Botões WhatsApp

## Problema

Quando o usuário clica em um botão interativo do WhatsApp, a Z-API envia o payload em um formato diferente do texto normal. O campo `payload.buttonsResponseMessage` (ou similar) contém a resposta, mas a função `parseMessageContent` só reconhece `payload.text.message`, `payload.image`, etc. Resultado: `messageContent` fica `null`, a mensagem é completamente ignorada (nem salva, nem processada pelo motor de fluxos).

## Solução

### Arquivo: `supabase/functions/zapi-webhook/index.ts`

**1. Atualizar `parseMessageContent`** para reconhecer respostas de botões interativos:

```typescript
// Adicionar antes do return:
} else if (payload.buttonsResponseMessage) {
  messageText = payload.buttonsResponseMessage.selectedButtonId || payload.buttonsResponseMessage.selectedDisplayText || "";
  messageType = "texto";
  messageContent = messageText;
} else if (payload.listResponseMessage) {
  messageText = payload.listResponseMessage.title || payload.listResponseMessage.singleSelectReply?.selectedRowId || "";
  messageType = "texto";
  messageContent = messageText;
}
```

A Z-API pode enviar respostas de botões em diferentes campos dependendo da versão. Os campos comuns são:
- `buttonsResponseMessage.selectedButtonId` — ID do botão clicado
- `buttonsResponseMessage.selectedDisplayText` — texto visível do botão
- `listResponseMessage.title` — título da opção selecionada em lista interativa

**2. Adicionar log do response body** na função `sendZapiButtons` (melhoria de debug pendente):

```typescript
const respBody = await resp.text();
console.log("Z-API send-button-list:", resp.status, respBody);
```

## Resultado esperado

Após a correção, quando Marco clicar em "OPÇÃO-2" no menu de botões:
1. A mensagem será parseada corretamente como texto
2. Será salva na conversa (aparecerá no chat)
3. O motor de fluxos processará a resposta e executará o próximo nó

