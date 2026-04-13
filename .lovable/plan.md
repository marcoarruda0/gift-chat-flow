

# Configuração de Fluxos: Resposta Padrão e Pós-Atendimento

## O que será feito

Criar uma seção na página de Configurações onde o admin pode vincular fluxos existentes a dois propósitos específicos:

1. **Fluxo de Resposta Padrão** — executado automaticamente quando uma nova mensagem chega e não há atendente ativo
2. **Fluxo Pós-Atendimento** — executado quando uma conversa é encerrada/finalizada

Inspirado no BotConversa, com cards visuais para cada tipo de fluxo, mostrando o fluxo selecionado e permitindo trocar.

## Mudanças

### 1. Nova tabela `fluxo_config`

```sql
CREATE TABLE public.fluxo_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  tipo text NOT NULL,  -- 'resposta_padrao' | 'pos_atendimento'
  fluxo_id uuid REFERENCES public.fluxos(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tipo)
);

ALTER TABLE public.fluxo_config ENABLE ROW LEVEL SECURITY;
-- RLS: tenant isolado, admin pode inserir/atualizar/deletar
```

### 2. Transformar a página Configurações (Placeholder → real)

**Arquivo:** `src/pages/Configuracoes.tsx` (novo)

A página terá:
- Link para Config Z-API (já existe)
- Link para Config IA (já existe)
- **Nova seção: Fluxos Automáticos**
  - Card "Fluxo de Resposta Padrão" com select do fluxo + toggle ativo/inativo
  - Card "Fluxo Pós-Atendimento" com select do fluxo + toggle ativo/inativo
  - Descrição explicativa em cada card
  - Busca os fluxos existentes do tenant para popular o select

### 3. Atualizar rotas

- `App.tsx`: trocar o Placeholder de `/configuracoes` pela nova página `Configuracoes`

### Fluxo do usuário

```text
Configurações
├── Fluxos Automáticos
│   ├── [Card] Fluxo de Resposta Padrão
│   │   ├── Toggle: Ativo/Inativo
│   │   └── Select: escolher entre fluxos existentes
│   └── [Card] Fluxo Pós-Atendimento
│       ├── Toggle: Ativo/Inativo
│       └── Select: escolher entre fluxos existentes
├── [Link] Configuração Z-API →
├── [Link] Configuração IA →
```

## Arquivos afetados
- **Migration**: criar tabela `fluxo_config` + RLS
- **Novo**: `src/pages/Configuracoes.tsx`
- **Editar**: `src/App.tsx` — trocar Placeholder pela nova página

