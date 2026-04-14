

# Fix: Assistente IA não avança no fluxo + auto_off/gerenciar_conversa

## Problemas identificados

### 1. Assistente IA nunca detecta `[SUCESSO]` (problema principal)

Os logs mostram que a IA respondeu "De nada! Se precisar de mais alguma coisa..." mas sem o prefixo `[SUCESSO]`. Causas:

- **Linha 444**: quando `sucesso_descricao` e `interrupcao_descricao` estão vazios, `exitInstructions` fica vazio — a IA nunca recebe instruções para usar os prefixos
- **Linha 497**: `resposta.startsWith("[SUCESSO]")` é frágil — falha se a IA colocar espaço, aspas, markdown ou qualquer coisa antes do prefixo
- A IA fica presa em loop multi-turno para sempre

### 2. Auto-off sobrescreve dados da sessão

- **Linhas 912 e 933**: `dados: { auto_off_ate: null }` substitui **todo** o objeto `dados`, apagando `historico_ia` e qualquer outro dado de sessão anterior
- Deveria fazer merge: `{ ...sessao.dados, auto_off_ate: ... }`

### 3. Gerenciar conversa — funciona em tese

O handler usa `break` que cai na lógica de "find next edge" (linha 1003). Se a edge existir, funciona. O problema é que o fluxo nunca chega lá porque fica preso no assistente IA.

## Solução

### Em `supabase/functions/zapi-webhook/index.ts`

**A. Defaults para condições de saída (linhas ~443-453)**

Quando `sucesso_descricao` estiver vazio, usar default automático:
- Sucesso: "A dúvida ou solicitação do usuário foi respondida/resolvida satisfatoriamente, o usuário agradeceu ou se despediu"
- Interrupção: "O usuário pede para falar com um humano, ou muda de assunto para algo completamente fora do escopo"

Isso garante que **todo** assistente_ia sempre tenha instruções de saída.

**B. Detecção robusta de prefixo (linhas ~497-504)**

Trocar `startsWith` por regex:
```typescript
const sucessoMatch = resposta.match(/^\s*\*?\*?\[SUCESSO\]\*?\*?:?\s*/i);
const interrupcaoMatch = resposta.match(/^\s*\*?\*?\[INTERRUPCAO\]\*?\*?:?\s*/i);
```

Também verificar com `includes` como fallback — se a IA colocar o prefixo no meio da resposta.

**C. Reforçar prompt de saída**

Mover as instruções de saída para o **início** do system prompt (antes de `instrucoes`) e torná-las mais enfáticas com exemplos concretos.

**D. Auto-off: preservar dados da sessão (linhas 908-936)**

Em vez de `dados: { auto_off_ate: null }`, fazer:
```typescript
const currentDados = sessao?.dados || {};
dados: { ...currentDados, auto_off_ate: autoOffAte }
```
Porém, no contexto do `executeFlowFrom`, não temos acesso direto aos dados da sessão. Solução: buscar a sessão atual antes de atualizar, ou usar SQL raw para fazer jsonb merge.

Alternativa mais simples: usar `UPDATE ... SET dados = dados || '{"auto_off_ate": "..."}'::jsonb` via RPC ou query direta.

**E. Adicionar log no exit para debug**

Logar quando o exitHandle é detectado e qual é o próximo nó para facilitar debug futuro.

## Arquivo afetado

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/zapi-webhook/index.ts` | Defaults de saída, regex robusta, prompt reforçado, auto_off preservar dados |

## Resultado esperado

Quando a IA perceber que a dúvida foi resolvida (ex: "De nada! Qualquer coisa é só chamar"), ela usará `[SUCESSO]` porque agora sempre terá instruções para isso. O engine detectará o prefixo mesmo com variações, seguirá pelo handle `sim` → auto_off → gerenciar_conversa → conversa fechada.

