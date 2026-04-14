

# Implementar Backend Completo do Nó "Assistente IA"

## Problema

O handler `assistente_ia` no webhook (linhas 697-731) é uma versão mínima que:
- Lê `config.prompt` mas o frontend salva `config.instrucoes`
- Envia uma mensagem fixa ("Responda de forma direta e concisa") em vez da mensagem real do contato
- Não suporta multi-turno (responde uma vez e o fluxo termina)
- Ignora todas as configurações do frontend: modelo, mensagem inicial, contexto geral, temperatura, condições de saída (sucesso/interrupção), inatividade

Por isso o fluxo parou no "Agente IA - Outros Assuntos" — o nó respondeu uma vez e encerrou a sessão.

## Mudanças no `supabase/functions/zapi-webhook/index.ts`

### 1. Handler `assistente_ia` no `executeFlowFrom` (linhas 697-731)

Reescrever completamente para:
- **Mensagem inicial**: Se `config.msg_inicial` está configurado e `config.msg_inicial_tipo === "contato"`, enviar a mensagem ao contato via Z-API
- **Marcar sessão como `aguardando_resposta: true`** no nó atual, com `dados` contendo o histórico de conversa da IA (array de mensagens)
- **Parar execução** (como faz o `triagem_ia` e o `menu`)

### 2. Resposta do `assistente_ia` no handler de sessão (após triagem_ia, ~linha 410)

Quando `sessao.aguardando_resposta` e nó atual é `assistente_ia`:
- Montar o system prompt usando: `config.instrucoes` + `config.contexto_geral` + `config.instrucoes_individuais` (com `replaceVariables`)
- Buscar artigos da `conhecimento_base` se existirem para o tenant (integrar base de conhecimento)
- Recuperar histórico de conversa da sessão (`sessao.dados.historico_ia`)
- Chamar a IA com o modelo configurado (`config.modelo`) e temperatura (`config.temperatura`)
- Adicionar condições de saída ao prompt:
  - Se a IA determinar "SUCESSO" (baseado em `config.sucesso_descricao`), seguir pelo handle `sim`
  - Se determinar "INTERRUPÇÃO" (baseado em `config.interrupcao_descricao`), seguir pelo handle `interrupcao`
  - Caso contrário, enviar resposta ao contato e manter `aguardando_resposta: true` (multi-turno)
- Atualizar histórico no `dados` da sessão
- Controle de inatividade: se `config.inatividade_tempo` configurado, verificar timestamp da última interação

### 3. Prompt inteligente com detecção de saída

O system prompt incluirá instrução para a IA retornar um prefixo especial:
- `[SUCESSO]` quando a condição de sucesso for atendida
- `[INTERRUPCAO]` quando detectar pedido de interrupção
- Caso contrário, responder normalmente

O handler parseará o prefixo para decidir se continua o loop ou segue para o próximo nó.

### 4. Tratamento de erro

Se a IA falhar, enviar `config.msg_erro` (ou mensagem padrão) ao contato.

## Estrutura dos dados na sessão

```text
sessao.dados = {
  historico_ia: [
    { role: "system", content: "..." },
    { role: "user", content: "mensagem do contato" },
    { role: "assistant", content: "resposta da IA" },
    ...
  ],
  ultima_interacao: "2026-04-14T09:34:44Z"
}
```

## Fluxo de execução

```text
1. Fluxo chega no assistente_ia
2. Envia msg_inicial (se configurada) → "Olá! Sou o assistente do setor X"
3. Pausa (aguardando_resposta = true, historico_ia = [])
4. Contato envia: "qual o horário de funcionamento?"
5. Monta prompt com instrucoes + contexto_geral + conhecimento_base
6. IA responde → envia ao contato
7. Se [SUCESSO] → handle "sim" → próximo nó
8. Se [INTERRUPCAO] → handle "interrupcao" → próximo nó
9. Caso contrário → mantém loop (volta ao passo 4)
```

## Arquivo afetado

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/zapi-webhook/index.ts` | Reescrever handler `assistente_ia`; adicionar resposta multi-turno no handler de sessão |

