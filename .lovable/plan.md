## Objetivo

Criar integração BlinkChat ↔ Sistema para consulta e débito de saldo (consignado + moeda PR) por CPF, em 2 webhooks (consulta + confirmação).

## Arquitetura

```
[1] BlinkChat ──POST {cpf, valor_item}──▶ saldos-consultar/{token}
                                                │
                                                ▼
                            consulta saldos por CPF + tenant
                                                │
              ┌─────────────────────────────────┴────────────────┐
              ▼                                                  ▼
     suficiente → 200 {nome, saldo_consignado,           insuficiente → 400
                       saldo_moeda_pr, total}            {erro: "saldo insuficiente"}

[2] BlinkChat envia ao cliente: "Seu saldo é R$ X. Confirma? SIM/NÃO"
    (mensagem montada pelo BlinkChat com o retorno do passo 1)

[3] Cliente responde SIM
    BlinkChat ──POST {cpf, valor_item, confirmado:true}──▶ saldos-confirmar/{token}
                                                │
                                                ▼
                debita: 1º moeda_pr, depois consignado
                grava em saldos_vendas (auditoria)
                retorna 200 {ok, debitado_moeda_pr, debitado_consignado}
```

## Decisões aplicadas (das suas respostas)

1. **Débito direto** em `saldos_consignado.saldo_total` e `saldos_moeda_pr.saldo`. Próximo upload de planilha sobrescreve (regra atual mantida).
2. **Prioridade de débito**: esgota `saldo` da Moeda PR primeiro; o restante sai de `saldo_total` do Consignado.
3. **Confirmação**: pelo body `{cpf, valor_item, confirmado:true}` (sem pre_aprovacao_id), conforme prompt original.
4. **Sem callback ativo** ao BlinkChat — o BlinkChat monta a mensagem usando a resposta do 1º webhook.

## Banco de dados

### Nova tabela `saldos_vendas` (auditoria de débitos)

```text
saldos_vendas
├─ id              uuid PK
├─ tenant_id       uuid (FK tenants)
├─ cpf_cnpj        text (normalizado)
├─ nome            text
├─ valor_total     numeric
├─ debito_moeda_pr numeric  (quanto saiu da moeda PR)
├─ debito_consignado numeric (quanto saiu do consignado)
├─ origem          text default 'blinkchat'
├─ created_at      timestamptz default now()
└─ index (tenant_id, cpf_cnpj, created_at desc)
```

RLS: SELECT por tenant; INSERT só via service role (edge function).

### Reuso de tabelas existentes
- `saldos_consignado` (col. `saldo_total` — débito via UPDATE)
- `saldos_moeda_pr` (col. `saldo` — débito via UPDATE)
- `vendas_online_config.blinkchat_token` — **mesmo token** já usado em `blinkchat-produto`, identifica o tenant

## Edge Functions

### `saldos-consultar` (público, `verify_jwt = false`)

**Rota**: `POST /functions/v1/saldos-consultar/{token}`
**Body**: `{ cpf: string, valor_item: number }`

Fluxo:
1. Extrai `token` da URL → busca `tenant_id` em `vendas_online_config` (mesmo padrão de `blinkchat-produto`).
2. Valida body com Zod (cpf 11 dígitos, valor_item > 0).
3. Normaliza CPF (`apenasDigitos`).
4. Busca em `saldos_consignado` e `saldos_moeda_pr` por `(tenant_id, cpf_cnpj)`.
5. Soma saldos. Retorna:
   - **200**: `{ ok:true, nome, cpf, saldo_consignado, saldo_moeda_pr, saldo_total, valor_item, suficiente:true }`
   - **400** (saldo insuficiente): `{ ok:false, codigo:"SALDO_INSUFICIENTE", saldo_total, valor_item, erro:"saldo insuficiente" }`
   - **404** (CPF não encontrado em nenhuma tabela): `{ ok:false, codigo:"CPF_NAO_ENCONTRADO", erro:"CPF sem cadastro" }`
6. Log estruturado com requestId mascarado.

### `saldos-confirmar` (público, `verify_jwt = false`)

**Rota**: `POST /functions/v1/saldos-confirmar/{token}`
**Body**: `{ cpf: string, valor_item: number, confirmado: boolean }`

Fluxo:
1. Token → tenant (mesmo padrão).
2. Valida body Zod; rejeita se `confirmado !== true`.
3. Busca saldos atuais; revalida suficiência (proteção contra mudança entre consulta e confirmação).
4. Calcula débito:
   - `debito_moeda_pr = min(saldo_moeda_pr, valor_item)`
   - `debito_consignado = valor_item - debito_moeda_pr`
5. **Em sequência** (Postgres não tem transação multi-statement via supabase-js, então uso RPC ou updates encadeados com rollback manual):
   - Cria função SQL `debitar_saldo_blinkchat(tenant, cpf, valor)` — `SECURITY DEFINER`, faz UPDATE nas 2 tabelas + INSERT em `saldos_vendas` atomicamente, retorna `{ debito_moeda_pr, debito_consignado, saldo_restante }`.
   - Edge function chama via `supabase.rpc('debitar_saldo_blinkchat', {...})`.
6. Retorna 200 `{ ok:true, debito_moeda_pr, debito_consignado, saldo_restante }` ou 400 com erro.

### Função SQL `debitar_saldo_blinkchat`
- Trava as linhas com `FOR UPDATE` para evitar race condition.
- Se saldo insuficiente, lança exception → edge converte em 400.
- Nunca deixa saldo negativo.

## Configuração

`supabase/config.toml` — adicionar:
```
[functions.saldos-consultar]
verify_jwt = false

[functions.saldos-confirmar]
verify_jwt = false
```

Sem novos secrets (o `BLINKCHAT_API_TOKEN` não é necessário — não há callback ativo).

## UI (mínima, opcional nesta entrega)

Em `/saldos-externos` adicionar uma aba "Histórico de Vendas" listando `saldos_vendas` (tabela paginada: data, nome, CPF, valor, fonte). Útil para auditoria. **Marcar como opcional** — posso entregar só backend se preferir.

## Tratamento de erros (padrão)

Todos os retornos seguem o padrão de `blinkchat-produto`:
- Sucesso: `{ ok:true, ...dados }` HTTP 200
- Erro: `{ ok:false, codigo, erro }` com HTTP 400/404/500
- Códigos: `TOKEN_INVALID`, `TOKEN_NOT_FOUND`, `BODY_INVALID`, `CPF_NAO_ENCONTRADO`, `SALDO_INSUFICIENTE`, `NAO_CONFIRMADO`, `DB_ERROR`, `INTERNAL`

## Ponto de atenção que você precisa saber

**Idempotência**: como a confirmação não tem ID único, se o BlinkChat reentregar o webhook (timeout/retry), o cliente é **debitado 2x**. Mitigação possível sem mudar contrato: deduplicar por `(tenant, cpf, valor_item, created_at < 30s)` — implemento isso na função SQL como guarda anti-duplicata. Avise se prefere desligar essa proteção.

## Arquivos a criar/editar

- `supabase/functions/saldos-consultar/index.ts` (novo)
- `supabase/functions/saldos-confirmar/index.ts` (novo)
- `supabase/migrations/...sql` (novo): tabela `saldos_vendas` + RLS + função `debitar_saldo_blinkchat`
- `supabase/config.toml` (editado): 2 blocos `verify_jwt = false`
- `src/pages/SaldosExternos.tsx` (editado, opcional): aba histórico

## Resumo de validação do seu prompt original

| Item do prompt | Status |
|---|---|
| 2 edge functions (consultar + confirmar) | ✅ ok |
| Body `{cpf, valor_item}` | ✅ ok (+ token na URL para multi-tenant) |
| Soma consignado + moeda PR | ✅ ok (campos reais: `saldo_total` e `saldo`) |
| 200 / 400 conforme suficiência | ✅ ok |
| Callback ao BlinkChat | ❌ removido (você confirmou que não precisa) |
| Body confirmação `{cpf, valor_item, confirmado}` | ✅ ok (com guarda anti-duplicata) |
| "Tabela de vendas" | → criada nova `saldos_vendas` |
| Débito proporcional | → substituído por "moeda PR primeiro, depois consignado" |
| Credenciais em env | ✅ token por tenant já existe (`blinkchat_token`) |
| Tipagens + erro tratado | ✅ Zod + códigos padronizados |
