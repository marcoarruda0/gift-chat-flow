

# Módulo de Fluxos — Builder de Automação com React Flow

## Visão Geral
Editor visual drag-and-drop para criar fluxos de automação WhatsApp. Canvas com nós conectáveis, sidebar de tipos de nós, e persistência no banco.

---

## 1. Tabela `fluxos` (Migration)
```sql
CREATE TABLE public.fluxos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  nome text NOT NULL DEFAULT 'Novo Fluxo',
  descricao text,
  nodes_json jsonb DEFAULT '[]',
  edges_json jsonb DEFAULT '[]',
  status text DEFAULT 'rascunho', -- rascunho | ativo | inativo
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```
- RLS por `tenant_id` (SELECT, INSERT, UPDATE, DELETE)
- Trigger `updated_at`

## 2. Instalar `@xyflow/react` (React Flow v12)

## 3. Página de Listagem `/fluxos`
- Tabela com fluxos: nome, status (badge), última atualização
- Botões: Novo fluxo, Duplicar, Excluir (com confirmação)
- Clicar num fluxo abre o editor `/fluxos/:id`

## 4. Página do Editor `/fluxos/:id`
Layout em 3 partes:
- **Toolbar superior**: nome editável, botões Salvar / Ativar-Desativar / Voltar
- **Sidebar esquerda**: paleta de nós arrastáveis (drag-and-drop para o canvas)
- **Canvas central**: React Flow com minimap e controles

### Tipos de Nós (8 tipos, cada um com cor e ícone):
1. **Gatilho** (verde) — Nó inicial. Config: tipo (palavra-chave, evento), texto, modo (exato/contém)
2. **Conteúdo** (azul) — Mensagem. Config: tipo (texto/imagem/áudio/vídeo/botões), corpo com variáveis `{{nome}}`, upload de mídia
3. **Condicional** (amarelo, losango) — Config: campo do contato, operador, valor. Duas saídas: Sim/Não
4. **Atraso** (cinza) — Config: modo (fixo/janela/aleatório), duração
5. **Assistente IA** (roxo) — Config: prompt, max turnos, saída fallback
6. **Tag** (laranja) — Config: ação (adicionar/remover), seleção de tag
7. **Webhook** (vermelho) — Config: URL, método, headers, body template
8. **Transferir p/ Humano** (rosa) — Config: departamento, mensagem

### Cada nó customizado terá:
- Header colorido com ícone + título editável
- Preview compacto do conteúdo configurado
- Handles de conexão (entrada topo, saída base; condicional tem 2 saídas)

## 5. Painel de Configuração
- Ao clicar num nó, abre sidebar direita (ou sheet) com formulário de configuração específico do tipo
- Salva no state local do React Flow → persiste no banco ao clicar "Salvar"

## 6. Persistência
- Salvar: serializa `nodes` e `edges` do React Flow → `UPDATE fluxos SET nodes_json, edges_json`
- Carregar: busca fluxo por ID → inicializa React Flow com os dados

## Arquivos a criar/editar:
- `src/pages/Fluxos.tsx` — listagem
- `src/pages/FluxoEditor.tsx` — editor com canvas
- `src/components/fluxos/NodePalette.tsx` — sidebar de nós arrastáveis
- `src/components/fluxos/nodes/` — 8 componentes de nó customizado
- `src/components/fluxos/NodeConfigPanel.tsx` — painel de configuração
- `src/App.tsx` — adicionar rotas `/fluxos` e `/fluxos/:id`
- Migration SQL para tabela `fluxos`

