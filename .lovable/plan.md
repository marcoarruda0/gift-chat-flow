

# Respostas Rápidas no Módulo Conversas

## Objetivo
Permitir que atendentes criem atalhos de texto (ex: `/saudacao`, `/preco`) que, ao digitar `/` no chat, exibem uma lista filtrável de respostas pré-configuradas para inserção rápida.

## Arquitetura

```text
┌──────────────────────────────┐
│  respostas_rapidas (tabela)  │
│  atalho, conteudo, tenant_id │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│  ChatInput.tsx               │
│  Detecta "/" → popup lista   │
│  Filtra por digitação        │
│  Click/Enter → insere texto  │
└──────────────────────────────┘
```

## Alterações

### 1. Migration — Tabela `respostas_rapidas`

Colunas: `id` (uuid), `tenant_id` (uuid), `atalho` (text, ex: "saudacao"), `conteudo` (text, o texto completo), `created_at`.

RLS: isolamento por `tenant_id`. Admin pode CRUD, todos do tenant podem ler.

### 2. UI — Popup de atalhos no `ChatInput.tsx`

- Detectar quando o texto começa com `/` ou contém `/` após espaço
- Buscar `respostas_rapidas` do tenant (cache local, fetch uma vez)
- Exibir popup flutuante acima do input com lista filtrável (Command/Popover)
- Navegação por setas (cima/baixo) e Enter para selecionar
- Ao selecionar: substituir o `/atalho` pelo conteúdo completo no textarea

### 3. UI — Tela de gerenciamento de respostas rápidas

- Nova seção na página Empresa (aba "Respostas Rápidas") ou acessível via ícone no chat
- CRUD de atalhos: nome do atalho + conteúdo (textarea)
- Suporte a variáveis `{nome}`, `{telefone}` (substituídas ao enviar)

### 4. Substituição de variáveis

- No `handleSend` do `Conversas.tsx`, antes de enviar, substituir `{nome}` e `{telefone}` pelos dados do contato selecionado

## Arquivos criados/alterados

| Arquivo | Tipo |
|---------|------|
| Migration (respostas_rapidas) | Novo |
| `src/components/conversas/RespostasRapidasPopup.tsx` | Novo (popup filtrável) |
| `src/components/conversas/RespostasRapidasConfig.tsx` | Novo (CRUD admin) |
| `src/components/conversas/ChatInput.tsx` | Alterado (detecção `/` + popup) |
| `src/pages/Empresa.tsx` | Alterado (nova aba) |
| `src/pages/Conversas.tsx` | Alterado (substituição variáveis no send) |

## Detalhes Técnicos

- O popup usa `Command` (cmdk) do shadcn para busca/filtro nativo com keyboard navigation
- Respostas são carregadas uma vez e cacheadas em state; realtime opcional para sync entre abas
- Atalhos são case-insensitive e sem caracteres especiais (slug)
- Limite sugerido: 50 respostas rápidas por tenant

