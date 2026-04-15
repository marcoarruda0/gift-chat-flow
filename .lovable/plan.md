

# Filtro "Sem Atendente" + Tempo de Espera na Lista de Conversas

## Resumo

Adicionar um filtro "Sem Atendente" na lista de conversas (visível para admins) e mostrar há quanto tempo cada conversa sem atendente está esperando.

## Mudanças

### 1. `src/components/conversas/ConversasList.tsx`

- Adicionar filtro **"Sem Atendente"** ao array `FILTROS` (condicional: só aparece se `isAdmin === true`)
- Receber nova prop `isAdmin: boolean`
- Filtro: `c.status === "aberta" && !c.atendente_id`
- Receber `created_at` no tipo `Conversa` para calcular tempo de espera

### 2. `src/components/conversas/ConversaItem.tsx`

- Receber nova prop opcional `createdAt: string | null`
- Quando `atendenteId` é null e status é aberta: mostrar badge com tempo de espera (ex: "⏱ 2h", "⏱ 3d") em vermelho/amber abaixo do nome ou no lugar do preview
- Usar `formatDistanceToNow` do date-fns para calcular

### 3. `src/pages/Conversas.tsx`

- Passar `isAdmin` (derivado de `hasRole('admin_tenant') || hasRole('admin_master')`) para `ConversasList`
- Incluir `created_at` nos dados da conversa passados à lista

## Resultado esperado

Admins veem um filtro extra "Sem Atendente" que lista apenas conversas abertas sem atendente designado. Cada item mostra há quanto tempo a conversa está esperando atendimento.

