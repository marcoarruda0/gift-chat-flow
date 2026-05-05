## Objetivo

Criar uma área no sistema para fazer **upload de duas planilhas** (.xlsx) que refletem saldos vindos de sistema externo:

1. **Saldo Consignado (fornecedores)** — planilha `relatorio-de-fornecedores-*.xlsx` (16 colunas, ~9.944 linhas). Coluna chave: `saldo_total` (col. O). Lookup por `cpf_cnpj`.
2. **Saldo Moeda PR (clientes)** — planilha `listagem-clientes-loja-*.xlsx` (7 colunas, ~1.393 linhas). Coluna chave: `Saldo` (col. G, formato "R$ 0,00"). Lookup por `CPF/CNPJ`.

Comportamento: a cada upload **a tabela inteira é substituída** (truncate + insert). Sem histórico.

## Estrutura proposta

### Banco de dados (2 tabelas novas, multi-tenant com RLS)

**`saldos_consignado`** — espelho da planilha de fornecedores:
- `id`, `tenant_id`, colunas: `loja_id`, `loja_nome`, `fornecedor_id_externo`, `codigo_maqplan`, `nome`, `email`, `telefone`, `celular`, `cpf_cnpj` (normalizado só dígitos + índice), `representante`, `interno`, `numero_contrato`, `saldo_bloqueado`, `saldo_liberado`, `saldo_total`, `data_cadastro`, `imported_at`

**`saldos_moeda_pr`** — espelho da planilha de clientes:
- `id`, `tenant_id`, colunas: `cliente_id_externo`, `nome`, `cpf_cnpj` (normalizado + índice), `email`, `telefone`, `loja`, `saldo` (numeric, parseado de "R$ x,xx"), `imported_at`

**RLS**: padrão do projeto (`tenant_id = get_user_tenant_id(auth.uid())`), com restrição de INSERT/DELETE para `admin_tenant`/`admin_master`.

**Tabela auxiliar `saldos_uploads_log`** (opcional, recomendada): registra data, usuário, tipo (consignado/moeda_pr), nome do arquivo, total de linhas — para mostrar "último upload em ...".

### Edge function: `saldos-importar`

Recebe arquivo .xlsx + tipo (`consignado` | `moeda_pr`):
1. Parseia com biblioteca xlsx (Deno).
2. Valida cabeçalhos esperados.
3. Normaliza CPF/CNPJ (apenas dígitos) e parseia saldo "R$ x,xx" → numeric.
4. Em transação: `DELETE WHERE tenant_id = ?` → `INSERT` em batches.
5. Grava log com totais.

Vantagem do edge function vs upload direto: permite parsear arquivos grandes (~10k linhas) sem travar o navegador e garante atomicidade.

### Frontend: nova página `/saldos-externos` (sidebar)

Nova entrada no menu **"Saldos Externos"** (ícone Wallet/Coins) com 2 abas:

**Aba "Saldo Consignado"**:
- Botão de upload .xlsx + drag-and-drop
- Info do último upload (data, usuário, total de registros)
- Tabela paginada com busca por CPF/nome
- Colunas: Nome, CPF, Loja, Saldo Total, Saldo Bloqueado, Saldo Liberado, Contrato

**Aba "Saldo Moeda PR"**:
- Mesmo padrão de upload
- Tabela com: Nome, CPF, Email, Telefone, Loja, Saldo

Acesso: `admin_tenant` / `admin_master` (consistente com outras importações do sistema).

### Integração com lookup por CPF (próximo passo opcional)

Como você mencionou "CPF é o dado de lookup", uma vez carregadas as tabelas, os saldos podem ser exibidos **na ficha do contato** (drawer existente em `src/components/contatos/ContatoDrawer.tsx`) buscando por CPF normalizado. Isto pode entrar nesta entrega ou ficar para uma próxima — me diga sua preferência (ver dúvidas).

## Dúvidas antes de implementar

1. **Onde colocar no menu?** Sugiro nova entrada "Saldos Externos" na sidebar, ou colocar como abas dentro de **Configurações** ou de **Contatos**. Qual prefere?

2. **Mostrar saldos na ficha do contato (CPF lookup)?** Já incluo nesta entrega a exibição automática dos dois saldos no drawer/perfil do contato quando o CPF bater, ou faz isso depois?

3. **Quem pode fazer upload?** Apenas `admin_tenant`/`admin_master` (padrão), ou qualquer usuário autenticado do tenant?

4. **Multi-loja**: a planilha de consignado tem `loja_id`/`loja_nome` (ex.: 32 — PR Tatuapé). Quer filtrar/separar por loja na visualização, ou tratar todos os registros juntos por tenant?

## Detalhes técnicos (para sua referência)

- Parser xlsx no edge function: `https://esm.sh/xlsx@0.18.5`
- Normalização CPF: reusa `apenasDigitos` de `src/lib/br-format.ts`
- Parser de saldo "R$ 1.234,56": remove "R$", troca `.` por nada, troca `,` por `.`, `parseFloat`
- Índices em `(tenant_id, cpf_cnpj)` para lookup rápido
- Limite Supabase de 1000 linhas por query — vou paginar a UI do lado do cliente
- Upload via FormData → edge function (não via storage, já que dados vão direto pro DB)
