## 🎯 Objetivo
Aprimorar o módulo **Campanhas** para tornar o agrupamento de campanhas (`campanha_grupos`) totalmente operacional na interface — exibindo, filtrando, editando rapidamente e consolidando resultados por grupo.

---

## 📋 Mudanças propostas

### 1) Nova coluna **Grupo** na tabela
- Adicionar `<TableHead>Grupo</TableHead>` entre **Canal** e **Tipo**.
- Renderizar um **badge colorido** usando `g.cor` como `backgroundColor` e o `g.nome`. Se a campanha não tiver grupo, mostrar um traço (`—`) discreto.
- Lookup em memória via `Map<id, grupo>` derivado de `grupos` para evitar re-busca.

### 2) Filtro por grupo ao lado das tabs de canal
- Em `src/pages/Campanhas.tsx`, junto à barra de tabs (`<Tabs>`), adicionar um `<Select>` "Grupo" com:
  - `Todos os grupos` (default)
  - `Sem grupo`
  - Lista de grupos existentes (com bolinha colorida)
- O state `filtroGrupo` já existe e já é aplicado em `campanhasFiltradas` — basta expor o controle visual.
- Layout: `<div className="flex items-center justify-between gap-3 flex-wrap">` envolvendo `<Tabs>` + `<Select>` para alinhar à direita.

### 3) Edição rápida do grupo na coluna **Ações**
- Novo componente local `EditarGrupoPopover` usando `Popover` (`src/components/ui/popover.tsx` já existe).
- Trigger: ícone `Tags` (botão `ghost` size `sm`) ao lado dos ícones existentes (`Eye`, `Send`, `Ban`).
- Conteúdo: lista de radio-options com **Sem grupo** + cada grupo (bolinha + nome). Ao clicar: chama `atualizarGrupoCampanha(c.id, novoId)` (já implementado na página) e fecha o popover.
- Toast de confirmação após sucesso.

### 4) Ícone correto e segurança de imports
- O dialog `GerenciarGruposDialog` **já usa** `Tags` de `lucide-react` (verificado no arquivo). O ícone `Tags` existe no Lucide e é exportado normalmente — confirmar com um build limpo.
- **Bug detectado nos console logs**: `Warning: Function components cannot be given refs` no `Badge` dentro de elementos Radix (Tooltip/Popover/Dialog). Vou converter `src/components/ui/badge.tsx` para `React.forwardRef<HTMLDivElement, BadgeProps>` para eliminar o warning agora que o Badge será usado dentro de `PopoverTrigger asChild` e tooltips.

### 5) Analítica consolidada por grupo
Criar nova seção colapsada acima da tabela (ou abaixo das tabs), visível somente quando há ≥1 grupo, intitulada **"Análise por grupo"**:

- **Cards/linhas por grupo** mostrando, para o conjunto de campanhas daquele grupo:
  - **Campanhas** (total no grupo)
  - **Destinatários** (Σ `total_destinatarios`)
  - **Enviados** (Σ `total_enviados`)
  - **Falhas** (Σ `total_falhas`)
  - **Taxa de entrega** (`enviados / destinatarios * 100`)
  - **Entregues / Lidos / Respostas** — métricas extras buscadas de `campanha_destinatarios` (campos `status_entrega`, `wa_message_id`) **somente para campanhas Oficial**.
- Implementação:
  - Cálculo simples (Σ por grupo) feito client-side com `useMemo` sobre `campanhas` + `grupos`.
  - Para entregue/lido/respostas: nova query agregada em `campanha_destinatarios` filtrando por `tenant_id` e `campanha_id IN (...)` agrupando por `status_entrega` — feita uma única vez ao carregar a página (`fetchAnaliticasGrupo`).
  - Render: grid responsivo de cards (1 col mobile / 2 col md / 3 col lg) com a cor do grupo na borda esquerda.
- Botão **"Ver campanhas"** em cada card que aplica `setFiltroGrupo(grupoId)` para focar a tabela naquele grupo.

> **Nota sobre "Respostas"**: hoje o schema não tem coluna explícita de "resposta recebida" por destinatário. A 1ª versão da analítica vai considerar como **resposta** a existência de uma mensagem `inbound` na tabela `mensagens` para a `conversa` daquele contato dentro de **24h** após o envio (consulta agregada). Se preferir manter simples nessa entrega, posso exibir apenas Enviados/Entregues/Lidos/Falhas e adicionar Respostas em iteração seguinte.

---

## 📁 Arquivos afetados

| Arquivo | Tipo | Mudança |
|---|---|---|
| `src/pages/Campanhas.tsx` | Editar | Coluna Grupo, filtro Select de grupo, popover de edição rápida nas ações, seção de analítica |
| `src/components/ui/badge.tsx` | Editar | Converter para `forwardRef` (corrige warning ao usar Badge como trigger) |
| `src/components/campanhas/EditarGrupoPopover.tsx` | Novo | Popover reutilizável com lista de grupos para troca rápida |
| `src/components/campanhas/AnaliticaGrupos.tsx` | Novo | Cards consolidados por grupo (métricas agregadas) |

Nenhuma migration de banco necessária — toda a estrutura (`campanha_grupos`, `campanhas.grupo_id`) já existe.

---

## ❓ Pergunta antes de implementar
Sobre **Respostas** na analítica: posso (a) entregar agora apenas **Enviados / Entregues / Lidos / Falhas** e deixar Respostas para uma próxima iteração, ou (b) já incluir Respostas via consulta a `mensagens` (`remetente='contato'` em até 24h após envio)? Se não responder, sigo com a opção **(a)** por ser mais rápida e segura.