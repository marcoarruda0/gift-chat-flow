

# Conectar "Fluxo de Resposta Padrão" ao Motor de Execução

## Problema

O motor de fluxos no webhook só ativa fluxos quando encontra um nó `gatilho` com texto que corresponde exatamente à mensagem do usuário. O "Fluxo de Resposta Padrão" configurado em `fluxo_config` nunca é consultado — ou seja, essa configuração não tem efeito nenhum.

## Como vai funcionar

Quando uma mensagem chega e:
1. Não há sessão de fluxo ativa
2. Nenhum gatilho de nenhum fluxo foi acionado
3. A conversa não tem atendente ativo (ou a conversa acabou de ser criada)

→ O webhook consulta a tabela `fluxo_config` para ver se existe um fluxo de `resposta_padrao` ativo para o tenant. Se existir, executa esse fluxo a partir do **primeiro nó após o gatilho** (ou do primeiro nó conectado se não houver gatilho).

## Mudança

### Arquivo: `supabase/functions/zapi-webhook/index.ts`

Na função `handleFluxoEngine`, após o loop de busca por gatilhos (linha ~344), antes do `return false`:

1. Consultar `fluxo_config` onde `tipo = 'resposta_padrao'` e `ativo = true` e `tenant_id = tenantId`
2. Se encontrar, carregar o fluxo referenciado (`fluxo_id`)
3. Verificar se a conversa tem `atendente_id` — se tiver atendente atribuído, não ativar (significa que um humano está cuidando)
4. Encontrar o primeiro nó executável (pular o gatilho, ir direto para o nó seguinte)
5. Criar sessão e executar o fluxo normalmente

```text
Mensagem chega
  → Sessão ativa? → processa resposta do menu
  → Gatilho match? → executa fluxo do gatilho
  → Fluxo Resposta Padrão configurado + sem atendente? → executa fluxo padrão  ← NOVO
  → Nada? → AI auto-responder
```

### Arquivo afetado

| Arquivo | Mudança |
|---------|---------|
| `zapi-webhook/index.ts` | Adicionar consulta a `fluxo_config` tipo `resposta_padrao` após loop de gatilhos, executar fluxo padrão se nenhum gatilho casou |

Nenhuma mudança de banco necessária — a tabela `fluxo_config` já existe com os campos necessários.

