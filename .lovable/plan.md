

# Campos Personalizados no CRM/Contatos

## Objetivo
Permitir que cada tenant defina campos customizados (ex: "Profissão", "Tamanho de roupa", "Preferência de cor") para seus contatos, além dos campos fixos já existentes.

## Arquitetura

```text
┌─────────────────────────────────┐
│  contato_campos_config          │
│  (definição dos campos)         │
│  nome, tipo, obrigatorio, ordem │
└──────────────┬──────────────────┘
               │ tenant define seus campos
               ▼
┌─────────────────────────────────┐
│  contatos.campos_personalizados │
│  (coluna JSONB no contato)      │
│  { "profissao": "Médico", ... } │
└─────────────────────────────────┘
```

## Alterações

### 1. Migration — Tabela `contato_campos_config` + coluna JSONB em `contatos`

**`contato_campos_config`**: `id`, `tenant_id`, `nome` (text), `tipo` (text: texto/numero/data/selecao/booleano), `opcoes` (text[] — para tipo "selecao"), `obrigatorio` (bool default false), `ordem` (int default 0), `ativo` (bool default true), `created_at`.

**`contatos`**: adicionar coluna `campos_personalizados` (jsonb, default `'{}'`).

RLS: isolamento por `tenant_id`. Apenas admin_tenant/admin_master podem criar/editar/deletar definições de campos. Todos do tenant podem ler.

### 2. UI — Configuração de Campos (nova aba ou seção em Empresa/Configurações)

- Tela para admin gerenciar campos: nome, tipo (Select), opções (se tipo=selecao), obrigatório (switch), ordem (drag ou setas)
- CRUD inline com botões adicionar/editar/excluir
- Preview do campo

### 3. UI — Formulário de Contato (`Contatos.tsx`)

- Buscar `contato_campos_config` do tenant (query separada)
- Renderizar campos dinâmicos no dialog de Novo/Editar contato, abaixo dos campos fixos
- Tipos de renderização:
  - `texto` → Input
  - `numero` → Input type=number
  - `data` → Input type=date
  - `selecao` → Select com as opções definidas
  - `booleano` → Switch/Checkbox
- Salvar valores no campo `campos_personalizados` (JSONB) do contato

### 4. UI — Tabela de Contatos

- Colunas dinâmicas opcionais na tabela (campos marcados como "visível na tabela")
- Ou: exibir campos personalizados ao expandir/detalhar o contato

## Arquivos criados/alterados

| Arquivo | Tipo |
|---------|------|
| Migration (tabela + coluna JSONB) | Novo |
| `src/components/contatos/CamposPersonalizadosConfig.tsx` | Novo (admin configura campos) |
| `src/components/contatos/CamposDinamicos.tsx` | Novo (renderiza campos no form) |
| `src/pages/Contatos.tsx` | Alterado (integrar campos dinâmicos no dialog) |
| `src/pages/Empresa.tsx` ou nova rota | Alterado (adicionar seção de config de campos) |

## Detalhes Técnicos

- JSONB é a abordagem mais flexível: não requer migrations quando o tenant adiciona/remove campos
- A validação de campos obrigatórios é feita client-side com base na config
- Busca/filtro por campos personalizados pode ser adicionado futuramente via operadores JSONB (`campos_personalizados->>'profissao' ilike '%médico%'`)
- Campos de tipo `selecao` armazenam as opções na coluna `opcoes` (text array) da config

