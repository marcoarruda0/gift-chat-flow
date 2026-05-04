
## Objetivo
Fazer o endpoint `blinkchat-produto` responder em **JSON** em vez de texto puro, facilitando o consumo no Blinkchat (acesso por nome de campo) e padronizando erros.

## Formato novo

**Sucesso (HTTP 200):**
```json
{
  "ok": true,
  "numero": 1,
  "descricao": "Anel de ouro",
  "valor": 1500.00,
  "valor_formatado": "R$ 1.500,00",
  "status": "disponivel",
  "link": "https://abacatepay.com/..."
}
```

**Erro (400/404/500):**
```json
{ "ok": false, "erro": "produto 5 nao encontrado", "codigo": "NOT_FOUND" }
```

Códigos: `TOKEN_INVALID`, `TOKEN_NOT_FOUND`, `ID_MISSING`, `ID_INVALID`, `NOT_FOUND`, `DB_ERROR`, `INTERNAL`.

## Mudanças

### 1. `supabase/functions/blinkchat-produto/index.ts`
- Substituir `textHeaders` por `jsonHeaders` com `Content-Type: application/json; charset=utf-8`.
- Helper `jsonError(status, codigo, erro)` e `jsonOk(produto)`.
- Trocar todas as respostas `new Response("ERRO: ...")` pelos helpers JSON.
- Manter validações, status codes e logs estruturados existentes.
- Manter URL e token no path inalterados.

### 2. `src/pages/BlinkchatTeste.tsx`
- Trocar `res.text()` por `res.json()` (com try/catch fallback).
- Critério "Formato OK": `res.ok && body.ok === true && typeof body.numero !== 'undefined'`.
- Mostrar JSON formatado (`JSON.stringify(body, null, 2)`) no `<pre>`.
- Atualizar texto-guia: descrever campos retornados.

### 3. `src/pages/VendasOnlineConfig.tsx` (card "Integração Blinkchat")
- Atualizar texto explicativo: resposta é JSON; listar campos `numero`, `descricao`, `valor`, `valor_formatado`, `status`, `link`.
- Mencionar exemplo de uso no Blinkchat: `{{response.descricao}}`, `{{response.valor_formatado}}`.

## Deploy e validação
- Deploy de `blinkchat-produto`.
- `curl` com token válido + id existente → JSON 200 com `ok:true`.
- `curl` com token válido + id inexistente → JSON 400 com `codigo:"NOT_FOUND"`.
- `curl` com token inválido → JSON 404 com `codigo:"TOKEN_NOT_FOUND"`.

## Compatibilidade
URL inalterada. Apenas o corpo muda de texto para JSON. No Blinkchat, o bloco GET deve parsear JSON e ler campos por nome em vez de fazer split por ` - `.

## Arquivos afetados
- `supabase/functions/blinkchat-produto/index.ts`
- `src/pages/BlinkchatTeste.tsx`
- `src/pages/VendasOnlineConfig.tsx`
