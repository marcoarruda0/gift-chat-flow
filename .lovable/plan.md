

# Implementar Engine de Execução para `triagem_ia` e `auto_off` no Webhook

## Problema identificado

O flow engine em `supabase/functions/zapi-webhook/index.ts` **não tem handlers** para os nós `triagem_ia` nem `auto_off`. Quando o fluxo chega nesses nós, cai no `default` (linha 659) e o fluxo termina silenciosamente. Além disso, o handler de resposta de sessão (linhas 232-293) só processa respostas para nós `menu` — não há lógica para processar a resposta do usuário quando está aguardando classificação da `triagem_ia`.

Também: o limite de botões na engine está em `<= 3` (linha 478), mas a UI agora permite 4.

## Mudanças no `supabase/functions/zapi-webhook/index.ts`

### 1. Handler `triagem_ia` no `switch` (dentro de `executeFlowFrom`)

Quando o fluxo chega num nó `triagem_ia`:
- Enviar a mensagem de saudação (`config.saudacao`) via Z-API, com `replaceVariables`
- Marcar sessão como `aguardando_resposta: true` no nó atual
- Parar execução (`return`)

### 2. Resposta da `triagem_ia` no handler de sessão (linhas 232-293)

Quando `sessao.aguardando_resposta` e o nó atual é `triagem_ia`:
- Pegar os setores do config (`config.setores`)
- Chamar a Lovable AI (modelo do config ou default `gemini-2.5-flash`) com um prompt de classificação:
  - System prompt: listar os setores com nome e descrição, pedir para retornar APENAS o nome exato do setor que corresponde
  - User message: a mensagem do contato
- Fazer match do resultado da IA com os setores configurados
- Se match → encontrar o edge com `sourceHandle: setor_{index}` → continuar execução
- Se não match → tentar novamente (até `max_tentativas`) ou seguir pelo handle `fallback`, enviando `msg_fallback`

### 3. Handler `auto_off` no `switch`

Quando o fluxo chega num nó `auto_off`:
- Calcular duração total em segundos a partir do config (`horas`, `minutos`, `segundos` ou `dias`)
- Salvar na tabela `fluxo_sessoes` um campo `auto_off_ate` (timestamp) = `now() + duração`
- No início do flow engine (`handleFluxoEngine`), antes de checar triggers, verificar se existe uma sessão com `auto_off_ate > now()` → se sim, retornar `true` (bloquear resposta automática)
- Continuar execução pro próximo nó normalmente

### 4. Corrigir limite de botões

Linha 478: mudar `opcoes.length <= 3` para `opcoes.length <= 4`

### 5. Migração DB (se necessário)

Adicionar coluna `auto_off_ate` (timestamptz, nullable) na tabela `fluxo_sessoes` para armazenar quando o auto-off expira. Alternativamente, usar o campo `dados` (jsonb) já existente.

## Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/zapi-webhook/index.ts` | Handlers `triagem_ia` e `auto_off`; resposta triagem na sessão; botões 4 |

## Fluxo de execução da Triagem IA

```text
1. Fluxo chega no nó triagem_ia
2. Envia saudação → "Olá {{nome}}! Como posso ajudar?"
3. Pausa (aguardando_resposta = true)
4. Usuário responde: "quero saber meu saldo"
5. IA classifica: "FINANCEIRO"
6. Match com setor[0].nome → handle setor_0 → próximo nó
7. Se não match após N tentativas → handle fallback
```

