

# Correção: Envio de mensagens para grupos no WhatsApp

## Problema
Quando o contato é um grupo do WhatsApp, o telefone armazenado contém o identificador de grupo (ex: `5511999999999-1234567890@g.us`). O código atual faz `.replace(/\D/g, "")` em todos os telefones antes de enviar via Z-API, removendo o `@g.us` e o hífen, tornando o ID inválido para grupos.

## Solução
Criar uma função auxiliar que detecta se o telefone é de grupo (`@g.us`) e, nesse caso, preserva o ID completo. Para telefones individuais, continua limpando normalmente.

## Alterações

### `src/pages/Conversas.tsx`

1. Adicionar helper no topo do componente:
```typescript
const formatPhone = (phone: string) => {
  // Group IDs must be sent as-is (contain @g.us)
  if (phone.includes("@g.us")) return phone;
  return phone.replace(/\D/g, "");
};
```

2. Substituir todas as 3 ocorrências de `.replace(/\D/g, "")` por `formatPhone(...)`:
   - Linha 246 (`handleSend`): `phone: formatPhone(selected.contato_telefone)`
   - Linha 274 (`handleSendAudio`): `phone: formatPhone(selected.contato_telefone)`
   - Linha 304 (`handleSendAttachment`): `const phone = formatPhone(selected.contato_telefone)`

## Arquivo afetado
- `src/pages/Conversas.tsx` — 4 linhas alteradas (1 helper + 3 substituições)

