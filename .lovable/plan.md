

# Funcionalidade de Departamentos

## Objetivo
Criar uma estrutura de departamentos (ex: "Vendas", "Suporte", "Financeiro") onde atendentes são vinculados, permitindo transferir conversas tanto para atendentes individuais quanto para departamentos inteiros.

## Alterações

### 1. Migration — Tabela `departamentos`

Nova tabela `departamentos`: `id` (uuid), `tenant_id` (uuid), `nome` (text), `descricao` (text, nullable), `ativo` (bool default true), `created_at`.

Adicionar coluna `departamento_id` (uuid, nullable) na tabela `profiles` — substitui o campo texto `departamento` atual por uma FK real.

Adicionar coluna `departamento_id` (uuid, nullable) na tabela `conversas` — permite atribuir conversa a um departamento.

RLS: isolamento por `tenant_id`. Admin pode CRUD, todos do tenant podem ler.

### 2. UI — CRUD de Departamentos (Empresa.tsx)

Nova aba "Departamentos" na página Empresa:
- Listar departamentos do tenant (nome, qtd membros)
- Criar/editar/excluir departamentos
- Componente: `DepartamentosConfig.tsx`

### 3. UI — Vincular atendente a departamento (Empresa.tsx)

Na aba "Equipe", adicionar Select de departamento ao lado de cada membro:
- Buscar departamentos do tenant
- Ao alterar, fazer update em `profiles.departamento_id`
- Exibir badge do departamento na listagem

### 4. UI — Transferir para Departamento (TransferirDialog.tsx)

Expandir o dialog de transferência com duas opções (Tabs):
- **Atendente**: comportamento atual (lista membros)
- **Departamento**: lista departamentos do tenant; ao transferir, seta `conversas.departamento_id` e limpa `atendente_id` (fica na fila do depto)

O `handleTransfer` em `Conversas.tsx` será atualizado para suportar ambos os tipos.

### 5. Filtro por Departamento (ConversasList.tsx)

Adicionar filtro "Meu Depto" nos filtros existentes:
- Filtra conversas onde `departamento_id` = departamento do usuário logado
- Conversas na fila do departamento (sem `atendente_id`) ficam visíveis para qualquer membro do depto

## Arquivos criados/alterados

| Arquivo | Tipo |
|---------|------|
| Migration (departamentos + colunas) | Novo |
| `src/components/empresa/DepartamentosConfig.tsx` | Novo |
| `src/components/conversas/TransferirDialog.tsx` | Alterado (tabs atendente/depto) |
| `src/pages/Empresa.tsx` | Alterado (aba Departamentos + select na equipe) |
| `src/pages/Conversas.tsx` | Alterado (handleTransfer com tipo depto) |
| `src/components/conversas/ConversasList.tsx` | Alterado (filtro "Meu Depto") |

## Detalhes Técnicos

- A coluna `profiles.departamento` (texto livre) existente será mantida temporariamente; o novo `departamento_id` referencia a tabela `departamentos`
- Conversa transferida para departamento: `atendente_id = null`, `departamento_id = X` — qualquer membro do depto pode "puxar" a conversa
- Mensagem de sistema: "Conversa transferida para o departamento Vendas"
- Realtime já ativo em `conversas`, então membros do depto veem a conversa aparecer automaticamente

