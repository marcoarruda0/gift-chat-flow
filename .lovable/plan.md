

# Configuração de Personalidade da IA por Tenant

## Objetivo
Permitir que cada tenant configure o tom, estilo e comportamento da IA (uso de emojis, formalidade, nome do assistente, instruções personalizadas) através de uma página de configurações. Essas preferências serão injetadas no system prompt do webhook.

## Arquitetura

```text
┌──────────────────────────────────┐
│ UI: /configuracoes/ia            │
│ - Nome do assistente             │
│ - Tom (formal/amigável/casual)   │
│ - Usar emojis? (sim/não/pouco)   │
│ - Instruções extras (textarea)   │
└──────────┬───────────────────────┘
           │
┌──────────▼───────────────────────┐
│ Tabela: ia_config                │
│ tenant_id, nome_assistente,      │
│ tom, usar_emojis, instrucoes,    │
│ ativo (on/off geral da IA)       │
└──────────┬───────────────────────┘
           │
┌──────────▼───────────────────────┐
│ zapi-webhook                     │
│ Busca ia_config do tenant        │
│ → Monta system prompt dinâmico   │
│ → Resposta no tom configurado    │
└──────────────────────────────────┘
```

## Alterações

### 1. Migration — Tabela `ia_config`
- `id`, `tenant_id` (unique), `nome_assistente` (default "Assistente Virtual"), `tom` (enum: formal, amigavel, casual), `usar_emojis` (enum: nao, pouco, sim), `instrucoes_extras` (text livre para instruções customizadas), `ativo` (boolean — liga/desliga IA), `created_at`, `updated_at`
- RLS por `tenant_id` (mesmo padrão das outras tabelas)
- Trigger `updated_at`

### 2. Página `src/pages/IAConfig.tsx`
- Campo: Nome do assistente (ex: "Bia", "Assistente Loja X")
- Select: Tom — Formal / Amigável / Casual
- Select: Emojis — Não usar / Usar pouco / Usar bastante
- Toggle: IA ativa (on/off)
- Textarea: Instruções extras (ex: "Sempre ofereça ajuda de um atendente humano no final", "Nunca fale de preços", "Chame o cliente pelo nome")
- Botão salvar com feedback via toast

### 3. Webhook `zapi-webhook/index.ts`
- Antes de montar o system prompt, buscar `ia_config` do tenant
- Se `ativo = false`, pular auto-resposta
- Montar prompt dinâmico baseado nas configurações:
  - Tom formal → "Responda de forma profissional e formal"
  - Tom amigável → "Responda de forma cordial e próxima, como um atendente simpático"
  - Tom casual → "Responda de forma descontraída e informal"
  - Emojis → instrução sobre uso de emojis
  - Nome → "Você se chama {nome}"
  - Instruções extras → adicionadas ao prompt

### 4. Rota + Sidebar
- Rota `/configuracoes/ia` no `App.tsx`
- Link no `AppSidebar.tsx` dentro do grupo Configurações

## Arquivos criados/alterados
| Arquivo | Tipo |
|---------|------|
| Migration (ia_config) | Novo |
| `src/pages/IAConfig.tsx` | Novo |
| `supabase/functions/zapi-webhook/index.ts` | Alterado (prompt dinâmico) |
| `src/App.tsx` | Alterado (rota) |
| `src/components/AppSidebar.tsx` | Alterado (link) |

