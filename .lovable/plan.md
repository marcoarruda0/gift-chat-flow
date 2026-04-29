# Distinção Individual × Grupos + contadores nos filtros

## Visão geral
Na lista de conversas (`ConversasList`), adicionar uma nova faixa de tabs **Individual / Grupos** logo abaixo do título "Conversas" (acima das tabs de canal Z-API/Oficial), e exibir um **contador** ao lado de cada filtro (Todas, Abertas, Minhas, Meu Depto, Fechadas, Sem Atendente).

## Como identificar grupos
Hoje não existe coluna `is_group` em `conversas`. O telefone do contato dos grupos vem do Z-API com sufixo `@g.us` (ex.: `120363...@g.us`), gravado em `contatos.telefone`. Usaremos esse marcador na UI — **sem migração de banco**:

```ts
const isGrupo = (c) => (c.contato_telefone || "").includes("@g.us");
```

Para isso precisamos que `contato_telefone` chegue até a `ConversasList` (hoje só vai até a página `Conversas.tsx`). Vamos passar esse campo no array enviado para o componente.

## Mudanças

### 1. `src/pages/Conversas.tsx`
- Incluir `contato_telefone` no objeto passado para `<ConversasList conversas={...} />` (já existe no estado, basta repassar).

### 2. `src/components/conversas/ConversasList.tsx`
- Estender a interface `Conversa` com `contato_telefone?: string | null`.
- Novo estado `tipoTab: "individual" | "grupos"` persistido em `localStorage` (chave `conversas_tipo_tab`), default `"individual"`.
- Renderizar **dois grupos de tabs** abaixo do título:
  - **Tipo**: Individual / Grupos (com contadores)
  - **Canal** (existente): Todos / Z-API / Oficial
- Aplicar o filtro de tipo **antes** do filtro de canal e do filtro de status, para que os contadores dos demais filtros reflitam apenas o tipo selecionado.
- Calcular contadores por filtro de status sobre a lista já filtrada por tipo + canal + busca:
  - Todas, Abertas, Minhas, Meu Depto, Fechadas, Sem Atendente (admin)
- Renderizar cada chip de filtro com sufixo numérico, ex.: `Abertas 10`, `Minhas 34`. Quando o contador for 0 manter o número visível em estilo discreto.

### 3. UX / responsividade
- Layout das tabs Individual/Grupos idêntico ao bloco existente de canal (`grid grid-cols-2`, mesma classe visual), para consistência.
- No viewport mobile (375px) os chips de filtro continuam em `flex-wrap`; o número fica como `<span>` em fonte um pouco menor ao lado do label.

## Diagrama
```text
┌─ Conversas ───────────────── [↻] [⇪] [+] ─┐
│  [ Individual 42 ] [ Grupos 7 ]            │  ← novo
│  [ Todos 49 ] [ Z-API 40 ] [ Oficial 9 ]   │
│  🔍 Buscar conversa...                      │
│  (Todas 42) (Abertas 10) (Minhas 34) ...    │  ← contadores
└─────────────────────────────────────────────┘
```

## Fora de escopo
- Migração para coluna `is_group` em `conversas` (não necessário; detecção por sufixo `@g.us` no telefone é suficiente e barata).
- Mudanças no painel de chat / envio para grupos.
