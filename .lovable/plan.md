# Detecção de duplicidade + merge completo no cadastro do Caixa

## Estado atual

O `NovoContatoCaixaDialog` (módulo Giftback Caixa) já tem:

- Validação de CPF/telefone com máscara
- Busca separada por CPF e por telefone
- Proposta de **complementar** quando o telefone (ou CPF) existente está com o outro campo vazio — `AlertDialog` simples
- Bloqueio de "conflito" quando CPF e telefone pertencem a contatos **diferentes** (hoje só mostra erro)
- Índice único `(tenant_id, cpf)` no banco

**Lacunas:**

1. **Normalização de telefone na busca**: o caixa grava telefone só com DDD+número (`11969851053`), mas o webhook do Z-API grava com prefixo país (`5511969851053`). A busca atual `eq("telefone", "11969851053")` **não encontra** o contato `5511969851053`, então o operador acaba criando um duplicado. Esse é o caso real do "Marco Arruda / Carol Oliveira" no banco.
2. **CPF duplicado dentro do tenant**: hoje só detecta se também houver match por telefone; se o usuário só informar CPF e ele já existir, sim detecta — mas a proposta atual é só "carregar". Não há um fluxo que mostre "CPF já cadastrado para X" com escolha clara entre carregar ou mesclar com outro registro.
3. **Conflito (CPF de A, telefone de B)**: hoje só bloqueia. O usuário quer poder **mesclar** os dois contatos preservando histórico.
4. **Modal de comparação**: o `AlertDialog` atual é texto curto. Faltam dados lado-a-lado (nome, e-mail, data de nasc., saldo de giftback, RFV) para o operador decidir.

## Plano de implementação

### 1. Normalização de telefone (`src/lib/br-format.ts`)

Adicionar helpers:

- `normalizarTelefoneBR(v)` → retorna o telefone "canônico" (10 ou 11 dígitos, sem DDI).
- `gerarVariantesTelefone(v)` → retorna as variantes que devem ser buscadas no banco:
  - 11 dígitos sem DDI (`11969851053`)
  - 13 dígitos com DDI 55 (`5511969851053`)
  - Para celulares antigos sem o "9" extra (10 dígitos), também a variante de 11 com 9 inserido — sob feature flag, opcional.

### 2. Busca robusta no `NovoContatoCaixaDialog`

Trocar `buscarMatches`:

- Para telefone: usar `.in("telefone", variantes)` em vez de `.eq("telefone", digitos)`.
- Manter busca por CPF como `.eq("cpf", cpfDigitos)`.
- Tudo escopado por `tenant_id` (RLS já cuida, mas adicionar filtro explícito por segurança).

Se a busca por telefone retornar mais de uma linha (raro, mas possível com variantes), tratar como caso de "merge entre 2 contatos do tenant" — entra no fluxo do passo 4.

### 3. Detecção e proposta de merge por CPF (caso simples)

Quando só CPF informado e ele já existe:

- Comportamento atual ("carregar") permanece o padrão para o "fluxo de venda".
- Adicional: se o nome digitado for **muito diferente** do nome do contato existente (`distância > limiar` simples por palavras), abrir o novo modal de comparação avisando "CPF já cadastrado como X — confirma que é o mesmo cliente?" e oferecendo: **Carregar este cliente** | **Cancelar** (não criar novo, pois CPF é único).

### 4. Merge completo entre dois contatos (`mesclarContatos`)

Nova função para o caso "conflito": CPF pertence a contato A, telefone (qualquer variante) pertence a contato B.

#### Fluxo no UI

Em vez de só mostrar erro, abrir o **modal de comparação** (item 5) listando A e B lado a lado e perguntando: "Esses dois cadastros são da mesma pessoa? Mesclar tudo no cadastro mais antigo?"

#### Lógica de merge no banco (ordem importa)

Definir **`alvo`** = contato mais antigo (menor `created_at`); **`origem`** = o outro.

Para preservar o histórico, em uma sequência de operações (não dá transação atômica via PostgREST — fazemos passo a passo, abortando ao primeiro erro):

1. **Reapontar histórico** da `origem` para `alvo` (todas tabelas com `contato_id`):
   - `compras`
   - `giftback_movimentos`
   - `giftback_comunicacao_log`
   - `campanha_destinatarios`
   - `optout_tokens`
   - `atendimento_satisfacao`
   - `conversas` (cuidado: se já existe conversa do alvo no mesmo canal, deixar as duas — o usuário decide depois; não tentar fundir conversas nesta versão)

2. **Somar `saldo_giftback`** do alvo += origem.

3. **Mesclar campos não-conflitantes** no alvo (preencher onde alvo é nulo a partir da origem):
   - `email`, `data_nascimento`, `endereco`, `genero`, `avatar_url`
   - `cpf` e `telefone`: garantir que o alvo fique com o CPF do A e o telefone do B (versão canônica/normalizada digitada agora)
   - `tags`: união
   - `campos_personalizados`: merge raso (chaves do alvo prevalecem; chaves novas da origem entram)
   - `notas`: concatenar com separador `\n---\n`
   - `opt_out_whatsapp`: OR lógico (se qualquer um optou, fica opt-out)

4. **Apagar a origem** (`DELETE FROM contatos WHERE id = origem.id`).

5. Invalidar React Query (`contatos`, `dashboard-contatos`, listas do CRM).

#### Onde isso roda

**Edge function dedicada**: `supabase/functions/mesclar-contatos/index.ts`

Motivo: várias operações sequenciais que precisam rodar com privilégios consistentes e em uma única chamada. A função:

- Recebe `{ alvo_id, origem_id }`.
- Usa o JWT do usuário para validar `tenant_id`.
- Usa a service role para executar as operações (RLS já bate com `tenant_id`, mas evita meio merge se uma policy bloquear algo no meio do caminho).
- Faz cada UPDATE/DELETE em ordem; em qualquer erro, retorna 500 com a etapa que falhou (não há rollback parcial — o usuário pode tentar de novo, as operações são idempotentes na maioria).
- Retorna o contato `alvo` atualizado.

**Por que não trigger SQL?** A política de "qual é o alvo" e a fusão de campos é regra de UI/produto; manter em código é mais flexível.

### 5. Modal de comparação (novo componente)

`src/components/giftback/MesclarContatosDialog.tsx`

Layout: tabela 3 colunas (Campo | Cadastro A | Cadastro B), linhas:
nome, CPF (mascarado), telefone (mascarado), e-mail, data nascimento, saldo giftback, RFV, criado em, nº de compras (resumo curto opcional via `contato_resumo`).

Ações:
- **Cancelar** (não faz nada — operador volta e ajusta os dados)
- **Mesclar no cadastro mais antigo** (chama edge `mesclar-contatos`)
- (Opcional v2): **Mesclar no cadastro mais recente** — alvo invertido

Mostra um aviso destacado: "Esta ação é irreversível. O histórico de compras, giftback e mensagens será unificado no cadastro escolhido."

Esse mesmo modal substitui também o `AlertDialog` simples do passo "complementar" — UI consistente, com a tabela mostrando que um dos lados está vazio no campo a complementar (visualmente claro pro operador).

### 6. Caixa: integração

Em `NovoContatoCaixaDialog.handleSalvar`, substituir os blocos `decisao.tipo === "conflito"` e `decisao.tipo === "juntar"` para abrir o `MesclarContatosDialog` com os dois contatos (no caso "juntar", o segundo é um "contato virtual" só com o campo a complementar — ou simplificamos passando o contato existente + os dados novos do form).

Nada muda em `GiftbackCaixa.tsx` além de receber o contato resultante via `onCriado`.

### 7. Limpeza dos dados existentes (opcional, fora do escopo direto)

Não rodar migração automática agora. O usuário pode usar o novo fluxo para mesclar manualmente os duplicados que já existem no banco (ex.: os dois "Marco Arruda" detectados anteriormente). Se quiser uma limpeza em lote, faço em iteração separada.

## Arquivos a alterar/criar

- `src/lib/br-format.ts` — adicionar `normalizarTelefoneBR`, `gerarVariantesTelefone`
- `src/components/giftback/NovoContatoCaixaDialog.tsx` — usar variantes na busca, abrir novo modal nos casos juntar/conflito
- `src/components/giftback/MesclarContatosDialog.tsx` — **novo** componente de comparação
- `supabase/functions/mesclar-contatos/index.ts` — **nova** edge function
- `supabase/config.toml` — registrar a nova função (`verify_jwt = true` por padrão)

Sem alterações de schema.

## Riscos e decisões

- **Não fundimos conversas**: se A e B têm cada um sua conversa Z-API, ambas continuam apontando para o `alvo` após reapontar `contato_id`. A UI de Conversas vai mostrar duas threads para o mesmo contato — aceitável para v1.
- **Merge de `tags` e `campos_personalizados`** é raso (sem conflito complexo).
- **Operações não-transacionais**: se a edge falhar no meio, o `alvo` pode ficar com parte do histórico mesclado. Documento isso no log da função e a operação é idempotente o suficiente para retry seguro.
- **Permissão**: qualquer usuário do tenant pode mesclar (mesmo critério das demais escritas em `contatos`). Posso restringir a admin se preferir — me avise.
