## Objetivo

Eliminar o parâmetro `tenant` da query string. Cada tenant passa a ter uma URL única, fixa e secreta, contendo um **token** no path. O Blinkchat chama apenas com `?id=N`, e o tenant é resolvido server-side pelo token.

## Como vai ficar

**Antes:**
```
/functions/v1/blinkchat-produto?id=1&tenant=fcaec321-57c6-445c-8e69-332408db6a86
```

**Depois:**
```
/functions/v1/blinkchat-produto/bc_a8f3k2x9p1m4q7w0?id=1
```

Cada tenant copia uma vez essa URL base no Blinkchat. Em cada nó do bot, ele só varia o `?id=`.

## Mudanças

### 1. Banco — adicionar token na configuração de Vendas Online

Migration:
- Adicionar coluna `blinkchat_token text unique` em `vendas_online_config`.
- Backfill: gerar token aleatório (`'bc_' || encode(gen_random_bytes(12), 'hex')`) para todos os tenants existentes.
- Marcar a coluna como `not null` após o backfill.
- Índice único já garante lookup rápido.

### 2. Edge Function `blinkchat-produto` — reescrever

- Aceitar token via path: extrair último segmento de `req.url` após `/blinkchat-produto/`.
- Buscar `tenant_id` em `vendas_online_config` por `blinkchat_token`.
- Se token inválido → 404 com texto `ERRO: token invalido`.
- Validar `?id=` (obrigatório, numérico) → 400 se ausente/ruim (mantém comportamento atual).
- Buscar produto em `chamado_denis_itens` por `(tenant_id, numero)`.
- Se não existir → 400 com texto `ERRO: produto nao encontrado` (decisão confirmada).
- Continuar formatando: `numero - descricao - R$ valor - status - link`.
- Manter logging estruturado já existente (request_id, token mascarado, id, ms).
- Continuar com `verify_jwt = false` (público).

### 3. Tela de Configurações (`VendasOnlineConfig.tsx`) — atualizar card "Integração Blinkchat"

- Carregar `blinkchat_token` da config do tenant.
- Mostrar a **URL completa pronta**: `https://ywcgburxzwukjtqxuhyr.supabase.co/functions/v1/blinkchat-produto/{token}?id=`
- Botão "Copiar URL".
- Botão "Rotacionar token" (gera novo, invalida o antigo) com confirmação — útil se vazar.
- Texto explicativo curto: "Cole esta URL no bloco GET do Blinkchat e adicione o número do produto após `?id=`."
- Remover qualquer menção a `tenant=` / UUID.

### 4. Tela de Teste (`BlinkchatTeste.tsx`) — simplificar

- Remover input de `tenant`.
- Manter input de `id`.
- Usar o `blinkchat_token` do tenant logado para montar a URL automaticamente.
- Manter validação visual (badge verde se resposta tem 5 campos separados por ` - `).

## Detalhes técnicos

- Token format: `bc_` + 24 hex chars (96 bits de entropia, suficiente para uso público não-crítico).
- Geração no client (rotação): usar `crypto.getRandomValues` + update via Supabase client (RLS já protege escrita por `tenant_id`).
- RLS de leitura na edge function: usar `SUPABASE_SERVICE_ROLE_KEY` para resolver token → tenant_id (bypassa RLS, necessário porque a chamada é anônima).
- Path parsing: `new URL(req.url).pathname.split('/').pop()`.

## Arquivos afetados

- Migration nova (coluna + backfill)
- `supabase/functions/blinkchat-produto/index.ts` (reescrita)
- `src/pages/VendasOnlineConfig.tsx` (card Blinkchat)
- `src/pages/BlinkchatTeste.tsx` (remove input tenant)

## Compatibilidade

A URL antiga (`?id=&tenant=`) deixará de funcionar. Como ela ainda não está em produção no Blinkchat (está dando 400), não há risco de quebrar integração existente.
