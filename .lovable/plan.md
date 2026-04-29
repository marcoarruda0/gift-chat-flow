## Painel lateral do contato no estilo Zoppy

Hoje já existe um `ContatoDrawer` rudimentar acionado a partir da lista de **Contatos**, mas:
- Ele NÃO abre ao clicar no avatar dentro de **Conversas** (requisito do usuário).
- Não tem a estética da inspiração Zoppy: KPIs no topo, perfil lateral fixo (Sobre, RFM, Vendedor principal), timeline central tipo "Registro de atividades" com cards coloridos, ícones de ações rápidas (WhatsApp, Giftback, Compras, Campanha) e filtros.
- Faltam eventos importantes como **fluxos** (entrou em fluxo X) e **giftback com detalhes** (código, validade, valor mínimo, se foi usado/expirou).

A função `contato_timeline` já cobre compras, giftback (crédito/débito/expirado), conversas, campanhas e satisfação — mas **não cobre fluxos**, e os payloads dos eventos de giftback/campanha estão pobres em detalhes.

### O que será feito

#### 1. Banco — enriquecer `contato_timeline`
Atualizar a função RPC `public.contato_timeline` para:
- Adicionar evento `fluxo` (a partir de `fluxo_sessoes` + `conversas`, com nome do fluxo via `fluxos.nome`).
- Enriquecer evento `giftback_credito` com `codigo`, `validade`, `valor_minimo`, `usado` (boolean), `expirado` (boolean) — checando se já existe débito/expiração com mesmo `compra_id` ou `referencia`.
- Enriquecer evento `campanha` com nome da campanha e canal (já tem) + assunto/template.
- Enriquecer eventos de compra com `forma_pagamento` se disponível.
- Adicionar agregados de KPIs no retorno (`kpis`): `valor_gasto_total`, `giftback_gerado_total`, `ticket_medio`, `num_compras`.

Também adicionar uma RPC complementar `contato_resumo(p_contato_id)` que retorna apenas os KPIs e o RFV (para carregamento rápido independente da timeline).

#### 2. Frontend — redesenho do `ContatoDrawer` no estilo Zoppy
Reescrever `src/components/contatos/ContatoDrawer.tsx` para usar um **Sheet largo** (`sm:max-w-5xl`) com layout em duas colunas:

```text
┌─────────────────────────────────────────────────────────────┐
│ ← Perfil do Cliente                                         │
├──────────────────┬──────────────────────────────────────────┤
│  Adna Soares     │  [KPI] [KPI] [KPI] [KPI]                 │
│  ✉ email         │  ┌─────────────────────────────────────┐ │
│  ☎ telefone      │  │ ▼ Filtrar                            │ │
│  [Campeão RFM]   │  └─────────────────────────────────────┘ │
│  ● aceita msgs   │                                          │
│  [💬][✓][🛒][💸]│  Registro de atividades                  │
│                  │  Qui, 09/04                              │
│  ── Sobre ──     │  ┃ 📢 Impactado pela campanha 11:57      │
│  Endereço:       │  ┃ Recebeu "TAT - INVERNO..."           │
│  Aniversário:    │                                          │
│  Gênero:         │  Sex, 03/04                              │
│  Perfil RFM:     │  ┃ 💰 Giftback Gerado          00:42    │
│  Vendedor:       │  ┃ Valor: R$ 54,20  Código: pecagomj4   │
│                  │  ┃ Validade: 18/05/2026  Mínimo: R$...  │
└──────────────────┴──────────────────────────────────────────┘
```

Componentes:
- **Coluna esquerda (perfil)** — `ContatoPerfilLateral.tsx` (novo): avatar grande, nome em destaque, email/telefone/endereço com ícones, badge RFV, status opt-in, 4 botões rápidos (Conversar, Marcar como cliente, Ver compras, Ver giftbacks), seção colapsável "Sobre" com aniversário/gênero/vendedor principal (`vendedor principal` = `operador_id` mais frequente em compras).
- **Coluna direita (timeline)** — `ContatoAtividades.tsx` (novo): 4 KPI cards no topo (Valor gasto, Giftback gerado, Ticket médio, N° compras), botão **Filtrar** com popover multi-select por tipo, lista agrupada por dia com cards coloridos por categoria (barra lateral colorida + ícone + título + detalhes específicos por tipo).

Cada tipo de evento tem renderização própria com os campos relevantes (giftback mostra código/validade/valor mínimo em colunas; campanha mostra nome entre aspas; fluxo mostra "Cliente entrou no fluxo X"; compra mostra valor/itens; satisfação mostra score e classificação).

Estética: cards brancos com sombra leve, barra lateral colorida de 4px à esquerda por tipo (verde=compra, azul=giftback, roxo=campanha, ciano=fluxo, violeta=conversa, amarelo=satisfação), tipografia hierárquica.

#### 3. Integração no painel de Conversas
- Em `src/components/conversas/ChatPanel.tsx`: tornar o avatar+nome do header **clicável** (cursor-pointer + hover), adicionar prop `onAbrirPerfil?: (contatoId) => void` e novo prop `contatoId`.
- Em `src/pages/Conversas.tsx`: passar `contato_id` para o `ChatPanel` e gerenciar estado `perfilContatoId`, renderizando `<ContatoDrawer contatoId={perfilContatoId} ... />` no nível da página.

#### 4. Pequenos ajustes
- Tooltip "Ver perfil completo" no avatar do `ChatPanel`.
- Manter o uso atual em `Contatos.tsx` funcionando (mesmo componente, agora mais rico).
- Remover a aba "Campos personalizados" duplicada — mover para dentro de "Sobre" como seção colapsável (consistente com Zoppy).

### Detalhes técnicos

**Migração SQL** (`supabase/migrations/<ts>_contato_timeline_enriquecida.sql`):
- `CREATE OR REPLACE FUNCTION public.contato_timeline(...)` adicionando o UNION com `fluxo_sessoes` e enriquecendo metadata de giftback/campanha.
- `CREATE OR REPLACE FUNCTION public.contato_resumo(p_contato_id uuid) RETURNS jsonb` — KPIs agregados.

**Arquivos a criar:**
- `src/components/contatos/ContatoPerfilLateral.tsx`
- `src/components/contatos/ContatoAtividades.tsx`
- `src/components/contatos/ContatoKpiCard.tsx` (pequeno, reutilizável)
- `src/components/contatos/EventoCard.tsx` (renderização polimórfica por `tipo`)

**Arquivos a editar:**
- `src/components/contatos/ContatoDrawer.tsx` — reestruturado para 2 colunas, Sheet `sm:max-w-5xl`.
- `src/components/contatos/ContatoTimeline.tsx` — passa a usar `EventoCard` e suporta novos tipos (`fluxo`).
- `src/components/conversas/ChatPanel.tsx` — avatar/nome clicáveis, novas props.
- `src/pages/Conversas.tsx` — estado e renderização do drawer.

Sem novas dependências. Recharts não é necessário (apenas KPI cards numéricos).