## Validação/máscara de CPF e telefone + cadastro contínuo no caixa

Hoje o `NovoContatoCaixaDialog` aceita qualquer texto em CPF/telefone e o painel busca usando o valor cru. O fluxo de carregar o contato recém-criado já existe (`onCriado` chama `carregarContato`), mas precisa ser blindado para o caso em que o usuário digitou um valor formatado/parcial.

### O que muda

1. **Novo util `src/lib/br-format.ts`** com:
   - `apenasDigitos(v)` — strip de não-dígitos.
   - `validarCPF(v)` — verifica 11 dígitos + dígitos verificadores + rejeita sequências repetidas.
   - `mascararCPF(v)` — aplica `000.000.000-00` progressivo.
   - `validarTelefoneBR(v)` — exige 10 (fixo) ou 11 (celular com `9` após DDD) dígitos e DDD da Anatel.
   - `mascararTelefoneBR(v)` — `(00) 0000-0000` ou `(00) 00000-0000`.
   - `ehProvavelCPF(v)` — substitui a heurística atual do dialog.

2. **`src/components/giftback/NovoContatoCaixaDialog.tsx`**
   - Inputs CPF e telefone passam a chamar a máscara no `onChange`, mantendo o estado já formatado.
   - Validação client-side (sem zod para esses dois campos — usar os utils, mensagens claras):
     - CPF, se preenchido, precisa passar em `validarCPF`. Erro: "CPF inválido".
     - Telefone, se preenchido, precisa passar em `validarTelefoneBR`. Erro: "Telefone inválido (use DDD + número)".
     - Pelo menos um dos dois precisa estar preenchido (regra atual mantida).
   - Pré-preenchimento: usar `ehProvavelCPF(valorBuscado)` para escolher entre CPF/telefone e já aplicar a máscara correspondente. Se o termo não for CPF válido nem telefone válido, ainda assim coloca no campo telefone (e a validação do form impedirá o submit até corrigir).
   - Antes de inserir/checar duplicidade, **persistir apenas dígitos** (`apenasDigitos`) em `contatos.cpf` e `contatos.telefone` — assim a busca por igualdade funciona consistentemente, igual ao formato usado pelo Z-API/Cloud webhook.
   - Checagem de duplicidade passa a usar os valores normalizados (dígitos).

3. **`src/pages/GiftbackCaixa.tsx`**
   - O input "CPF ou telefone do cliente" também passa pela normalização antes da consulta:
     - `const termo = apenasDigitos(busca)` → `.or(\`cpf.eq.${termo},telefone.eq.${termo}\`)`.
     - Se `termo.length` não bate com CPF (11) nem telefone (10/11), ainda tenta a busca; se nada encontrar, `naoEncontrado = true` (fluxo atual) — o dialog abrirá com o valor já normalizado e aplicará a máscara correta.
   - **Cadastro contínuo**: o `onCriado` já chama `carregarContato(novo)`, que seta `contato`, zera `naoEncontrado` e libera os controles de "Valor da compra"/"Aplicar giftback". Vou garantir que o foco/scroll vá para o card do contato (scrollIntoView no card) para o operador continuar sem cliques extras. Nada a fazer no banco — só ajuste de UX.

### Por que não migração de dados antigos?

Contatos já gravados podem estar em formatos mistos (com ou sem máscara). Como a busca atual já é exata, isso não muda o comportamento existente: a partir de agora **novos cadastros do caixa** entram normalizados (dígitos), e a busca pelo termo do operador também é normalizada antes de consultar — então casa quando o registro existe em qualquer formato? Não totalmente: só casa se os dois lados estão em dígitos. Para evitar surpresa, o util é exposto e podemos numa próxima migração normalizar a base inteira; mas isso fica fora deste passo (sem perda de dados, comportamento atual preservado para registros legados).

### Diagrama do fluxo após o ajuste

```text
[busca CPF/tel] -> normaliza dígitos -> SELECT contatos
       |
       +-- achou ----> carregarContato (fluxo atual)
       |
       +-- não achou -> aviso inline + botão
                              |
                       [Dialog Novo Cliente]
                       máscara + validação
                              |
                  insert(dígitos puros) → contato criado
                              |
              onCriado(novo) → carregarContato(novo)
                              |
                  card do cliente entra na tela
                  (scrollIntoView automático)
                              |
                     fluxo de Giftback continua
```

Posso aplicar?