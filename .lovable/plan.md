# Integração Blinkchat — diagnóstico, formato e ferramentas

Quatro melhorias na integração já existente (`/blinkchat-produto`) para facilitar uso e troubleshooting.

## 1. Logs estruturados na edge function

Em `supabase/functions/blinkchat-produto/index.ts`, adicionar `console.log`/`console.error` em pontos-chave para que apareçam em Edge Function Logs (Lovable Cloud → Backend):

- Início de cada request: método, `id`, `tenant`, `user-agent`, `referer`.
- Erros de validação (id ou tenant ausente/ inválido) com motivo.
- Erro de DB (com mensagem do Supabase).
- Slot não encontrado (404).
- Sucesso: `id`, `tenant`, status do slot, tempo total em ms.

Cada log usa um `requestId` curto (ex: `crypto.randomUUID().slice(0,8)`) prefixado, para correlacionar entrada/saída de uma mesma requisição.

## 2. Formato fixo da resposta

Garantir que a resposta SEMPRE siga exatamente:

```text
{numero} - {descricao} - R$ {valor} - {status} - {link}
```

Regras de fallback (quando slot vazio ou sem dado):

- `descricao` vazia → `"sem descricao"`
- `valor` ausente/0 → `"0,00"` (formato pt-BR sempre com 2 casas)
- `status` ausente → `"disponivel"`
- `link` ausente → `"sem link"` (em vez de omitir o trecho)

Hoje o link é omitido quando vazio, quebrando o formato esperado. Passa a ser sempre 5 campos separados por ` - `.

Erros (id/tenant inválido, slot não encontrado, erro interno) continuam retornando texto descritivo com status HTTP apropriado, mas marcados claramente como `ERRO: ...` para o Blinkchat distinguir.

## 3. Card "Endpoint Blinkchat" em Configurações Vendas Online

Em `src/pages/VendasOnlineConfig.tsx`, novo card abaixo dos demais com:

- Título: "Integração Blinkchat"
- Descrição curta explicando o uso (substitui planilha do Google Sheets).
- Campo readonly com a URL completa pré-preenchida:
  ```
  https://ywcgburxzwukjtqxuhyr.supabase.co/functions/v1/blinkchat-produto?id={{id}}&tenant=<TENANT_ID>
  ```
  Onde `<TENANT_ID>` vem de `profile.tenant_id` e `{{id}}` é literal (placeholder do Blinkchat).
- Botão "Copiar URL" usando a mesma `toast` já em uso.
- Link/botão "Abrir tela de teste" → navega para `/vendas-online/blinkchat-teste`.
- Bloco de exemplo mostrando o formato exato da resposta.

## 4. Tela de teste do endpoint

Nova página `src/pages/BlinkchatTeste.tsx` em rota `/vendas-online/blinkchat-teste` (registrada em `src/App.tsx`, protegida por `ProtectedRoute`). Conteúdo:

- Inputs: `id` (number, default 1) e `tenant` (text, pré-preenchido com `profile.tenant_id`, editável para testar outros tenants).
- Botão "Testar endpoint" que faz `fetch` GET para a URL pública (sem auth header).
- Mostra:
  - URL chamada (com botão copiar).
  - HTTP status + tempo de resposta em ms.
  - Corpo da resposta em `<pre>` monoespaçado.
  - Validação visual: se a resposta tem 5 campos separados por ` - ` → badge verde "formato OK", senão badge vermelho.
- Botão "Voltar para configurações".

Adicionar link no `AppSidebar` não é necessário — acesso via card de configurações basta.

## Arquivos afetados

- `supabase/functions/blinkchat-produto/index.ts` — logs + formato fixo
- `src/pages/VendasOnlineConfig.tsx` — novo card
- `src/pages/BlinkchatTeste.tsx` — nova página
- `src/App.tsx` — nova rota

## Como diagnosticar problemas depois

Após a entrega, qualquer falha do Blinkchat pode ser investigada com a ferramenta `supabase--edge_function_logs` (function `blinkchat-produto`), filtrando pelo `requestId` ou pelo `tenant`/`id` em questão.
