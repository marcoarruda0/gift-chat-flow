## Objetivo
Implementar a regra de negócio: **um giftback recém-gerado não pode ser resgatado no mesmo dia em que foi criado — só a partir do dia seguinte (D+1)**.

Hoje, quando o caixa registra uma compra que gera giftback e, na mesma data, o cliente faz outra compra, o saldo ativo já aparece disponível para uso. Vamos travar isso.

## Diagnóstico do fluxo atual
- `src/pages/GiftbackCaixa.tsx` busca o único giftback ativo (`giftback_movimentos`, `tipo='credito'`, `status='ativo'`) e já carrega `created_at`, `valor` e `validade`.
- `calcularTransacaoGiftback` (em `src/lib/giftback-rules.ts`) é a função pura que decide `gbUsado` / `gbGerado` / `acaoSobreAtivo` / `erroValidacao`. Ela NÃO conhece datas hoje.
- O toggle "Aplicar giftback" no caixa habilita o resgate sempre que `saldoAtivo > 0`.
- A validade é apenas data (`date`), sem hora — então a comparação de "criado hoje" precisa ser feita por **data local** (não UTC) para evitar bugs de fuso.

## Mudanças propostas

### 1) Regra pura — `src/lib/giftback-rules.ts`
- Adicionar campo opcional `criadoEm?: string | Date | null` em `CalcularTransacaoInput`.
- Adicionar nova flag em `ResultadoTransacao`: `bloqueadoMesmoDia: boolean`.
- Lógica:
  - Se `criadoEm` estiver no **mesmo dia local** que `agora` e o usuário marcou `aplicarGiftback`, retornar `erroValidacao` claro: _"Giftback criado hoje só pode ser utilizado a partir de amanhã (D+1)."_ e `bloqueadoMesmoDia: true`.
  - Caso contrário, comportamento atual.
- Adicionar utilitário interno `isMesmoDiaLocal(a, b)` (compara `YYYY-MM-DD` no fuso local) — sem dependência externa.

### 2) Caixa — `src/pages/GiftbackCaixa.tsx`
- Passar `criadoEm: giftbackAtivo?.created_at` para `calcularTransacaoGiftback` no preview e na mutation de gravação (defesa em profundidade).
- Quando `bloqueadoMesmoDia === true`:
  - **Desabilitar** o `Switch` "Aplicar giftback" e marcar como `false` (forçado).
  - Exibir aviso informativo (não destrutivo) abaixo do bloco do giftback ativo:  
    _"Este giftback foi gerado hoje (DD/MM) e poderá ser utilizado a partir de DD/MM (amanhã)."_
  - Adicionar entrada em `motivosBloqueio` somente se o usuário tentar aplicar.
- Importante: a regra **não** deve invalidar o ativo se o cliente fizer nova compra hoje sem usar — o giftback continua válido para amanhã. Hoje, `acaoSobreAtivo` vira `"substituir"` ou `"invalidar_nao_uso"` quando há nova compra. Vou ajustar `calcularTransacaoGiftback` para que, **quando `bloqueadoMesmoDia` é verdade**, o ativo seja **preservado** (`acao = "nenhum"`) mesmo com nova compra geradora — caso contrário a regra D+1 viraria uma armadilha que destrói o saldo.

### 3) Edge case — validade muito curta
Se `validade_dias = 1` e o giftback é criado hoje, ele venceria amanhã, dando apenas 1 dia útil de uso. Isso é aceitável e respeita a configuração — **não** vou alterar `validade` automaticamente. Apenas vou registrar nota no aviso quando `validade === amanhã`:  
_"Atenção: este giftback vence em DD/MM."_

### 4) Testes — `src/lib/__tests__/giftback-rules.test.ts`
Adicionar casos:
- Tentar aplicar giftback criado hoje → `erroValidacao` setado, `bloqueadoMesmoDia: true`, `gbUsado = 0`.
- Giftback criado ontem → uso permitido normalmente.
- Nova compra hoje, sem aplicar, com ativo criado hoje → `acaoSobreAtivo === "nenhum"` (ativo preservado), `gbGerado` ainda calculado se compra ≥ mínima.
- Comparação por data local (evitar regressão de fuso).

## Arquivos afetados
- **Modificado**: `src/lib/giftback-rules.ts` (novo input, nova flag, lógica D+1, preservação do ativo).
- **Modificado**: `src/pages/GiftbackCaixa.tsx` (passar `criadoEm`, desabilitar toggle, exibir aviso).
- **Modificado**: `src/lib/__tests__/giftback-rules.test.ts` (cobertura D+1).

## Sem mudanças necessárias
- **Banco / RLS**: nenhum — a regra é client-side + função pura. Não há edge function que aplique giftback no caixa hoje.
- **Tabela `giftback_movimentos`**: já temos `created_at`, suficiente para a comparação.
- **`expirar-giftbacks`** edge function: regra de expiração por `validade` continua igual.

## Pergunta única (opcional)
A regra "criado hoje = bloqueado" deve usar **data civil local do navegador** (mais intuitiva para o operador, ex.: criado às 23:55 → liberado em 5 min na virada do dia) ou **24 horas corridas a partir do `created_at`** (ex.: criado 23:55 → liberado só amanhã às 23:55)?

Se você não responder, sigo com **data civil local** (opção mais simples e alinhada com como lojas operam por "dia de caixa").