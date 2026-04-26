## Objetivo

Hoje a lista lateral de **Conversas** mistura conversas vindas do **Z-API** (WhatsApp não-oficial) com as do **WhatsApp Cloud / WABA** (oficial). Vou adicionar **tabs superiores de canal** dentro da lista para separar visualmente os dois fluxos, mantendo todos os filtros existentes (Todas / Abertas / Minhas / Meu Depto / Fechadas / Sem Atendente) operando dentro do canal selecionado.

A coluna `canal` já existe em `conversas` (valores `zapi` e `whatsapp_cloud`) e já é carregada no `fetchConversas` em `src/pages/Conversas.tsx` — então não há mudança de banco/edge function.

---

## Mudanças

### 1. `src/components/conversas/ConversasList.tsx`

**Adicionar tab de canal acima dos filtros existentes**, com 3 opções:
- **Todos** (padrão) — comportamento atual
- **Z-API** — apenas `canal === 'zapi'` (ou null/legado)
- **WhatsApp Oficial** — apenas `canal === 'whatsapp_cloud'`

Detalhes de implementação:
- Estender a interface `Conversa` com `canal?: string | null` (já vem populada do `Conversas.tsx`).
- Novo state `canalTab: 'todos' | 'zapi' | 'whatsapp_cloud'` (padrão `'todos'`).
- Aplicar o filtro de canal **antes** do filtro de status/atendimento atual no `filtered`:
  ```ts
  if (canalTab === 'zapi' && c.canal === 'whatsapp_cloud') return false;
  if (canalTab === 'whatsapp_cloud' && c.canal !== 'whatsapp_cloud') return false;
  ```
  (assim conversas legadas sem `canal` definido caem em "Z-API", que é o comportamento atual.)
- UI: usar `Tabs` do shadcn (`@/components/ui/tabs`) logo abaixo do header "Conversas / botões de ação" e acima do search, com labels curtos e um pequeno **contador por canal** (ex.: `Z-API (12)`, `Oficial (3)`) calculado a partir de `conversas`.
- Ícones leves opcionais ao lado dos labels: `MessageSquare` para Z-API, `BadgeCheck` para Oficial (já disponível no lucide-react).

### 2. `src/pages/Conversas.tsx`

Nenhuma mudança funcional grande — o `canal` já é mapeado em `fetchConversas` (linha 99) e passado dentro de cada item de `conversas` para `ConversasList`. Apenas garantir que a prop `canal` continue chegando intacta (já chega).

Opcionalmente: persistir a aba selecionada em `localStorage` (`conversas_canal_tab`) para que o atendente reabra a página no canal que estava trabalhando. Isso é pequeno e fica encapsulado em `ConversasList`.

---

## Comportamento esperado

- Ao abrir `/conversas`, a aba **"Todos"** vem selecionada por padrão (mantém compatibilidade).
- Ao clicar em **Z-API**: apenas conversas Z-API aparecem; filtros (Abertas/Minhas/etc.) continuam funcionando dentro do recorte.
- Ao clicar em **WhatsApp Oficial**: apenas conversas WABA aparecem; o `cloudWindowBlocked` (24h) continua funcionando normalmente no `ChatPanel` quando uma delas é selecionada.
- Contadores nas tabs refletem o total bruto por canal (sem aplicar busca/filtro), para servir como "inbox" rápido.
- Conversa selecionada permanece selecionada ao trocar de tab; se o `canal` dela não bater com a tab atual ela some da lista, mas o painel direito segue aberto (comportamento natural — basta voltar à tab "Todos").

---

## Arquivos afetados

- **Modificado**: `src/components/conversas/ConversasList.tsx` (adicionar tabs de canal, contadores e filtro por canal).
- **Modificado (mínimo)**: `src/pages/Conversas.tsx` — apenas se for necessário ajustar tipos da prop (provavelmente não, pois `canal` já é repassado implicitamente). Confirmo na implementação.

Sem migrações de banco, sem edge functions, sem alterações em `ChatPanel`.