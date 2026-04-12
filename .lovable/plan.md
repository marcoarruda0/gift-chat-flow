

# Distribuição Automática Round-Robin de Conversas por Departamento

## Objetivo
Quando uma nova conversa chega e o departamento tem mais de um atendente, distribuir automaticamente usando round-robin (alternando entre os membros).

## Alterações

### 1. Migration — Tabela `departamento_distribuicao`

Nova tabela para rastrear o último atendente que recebeu conversa em cada departamento:

- `id` (uuid PK)
- `tenant_id` (uuid)
- `departamento_id` (uuid)
- `ultimo_atendente_id` (uuid) — o último que recebeu
- `updated_at` (timestamp)
- Unique constraint em `(tenant_id, departamento_id)`
- RLS: isolamento por tenant_id

### 2. Função SQL `distribuir_atendente`

Criar function `distribuir_atendente(p_tenant_id uuid, p_departamento_id uuid)` que:
1. Busca todos os profiles do departamento, ordenados por `id`
2. Busca o `ultimo_atendente_id` da tabela `departamento_distribuicao`
3. Seleciona o próximo na lista (round-robin circular)
4. Atualiza `departamento_distribuicao` com o novo atendente
5. Retorna o `user_id` escolhido

### 3. Webhook `zapi-webhook/index.ts`

Na função `findOrCreateConversa`, quando uma conversa **nova** é criada:
- Buscar o departamento padrão do tenant (ou usar lógica de roteamento existente)
- Chamar `distribuir_atendente` via RPC para obter o atendente
- Setar `atendente_id` e `departamento_id` na conversa criada

### 4. Transferência para departamento (`Conversas.tsx`)

Quando uma conversa é transferida para um departamento (sem atendente específico):
- Chamar `distribuir_atendente` para o departamento alvo
- Atribuir automaticamente ao próximo atendente da fila round-robin
- Mensagem de sistema: "Conversa atribuída a {nome} (Departamento {depto})"

## Arquivos criados/alterados

| Arquivo | Tipo |
|---------|------|
| Migration (tabela + função SQL) | Novo |
| `supabase/functions/zapi-webhook/index.ts` | Alterado (auto-assign ao criar conversa) |
| `src/pages/Conversas.tsx` | Alterado (round-robin na transferência para depto) |

## Detalhes Técnicos

- A função SQL usa `SECURITY DEFINER` para acessar profiles sem depender de RLS
- Round-robin é determinístico: ordena membros do depto por `id`, encontra o próximo após o último atribuído
- Se o departamento tem 1 membro, sempre atribui a ele
- Se não há membros no departamento, `atendente_id` fica null (fila do depto)
- Realtime já ativo — o atendente verá a conversa aparecer automaticamente

