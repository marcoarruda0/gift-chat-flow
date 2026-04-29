## Objetivo

Reforçar a validação do **Page Access Token** do Instagram (front + back) e adicionar um botão **"Testar token"** que valida formato, conectividade e permissões antes de marcar a conexão como ativa.

---

## 1. Validação compartilhada do token

Criar um validador comum (regras idênticas no front e no back):

- Remover espaços, quebras de linha, tabs, aspas simples/duplas e crases.
- Rejeitar se contiver espaços internos, aspas ou caracteres fora de `[A-Za-z0-9_-]`.
- Rejeitar se `length < 100` (Page Access Tokens longa-duração têm ~180+ chars; o limite atual de 50 é frouxo demais e deixou passar tokens truncados).
- Recomendar prefixo `EAA` (token Meta) — apenas warning, não bloqueio.
- Retornar objeto `{ ok, cleaned, error }` com mensagem em PT-BR explicando como corrigir.

### Front (`src/pages/InstagramConfig.tsx`)
- Adicionar `validateToken(raw)` local.
- No `onChange` do campo Token: limpar automaticamente e mostrar feedback inline (ícone verde/vermelho + mensagem curta abaixo do input).
- Desabilitar botão **Salvar** enquanto token for inválido.
- Mostrar contador de caracteres (`{cleaned.length} caracteres`).
- No `handleSave`: re-validar e abortar com `toast.error` específico se inválido.

### Back (`instagram-proxy/index.ts`)
- Aplicar mesma regra (length ≥ 100, regex estrita).
- Mensagem de erro detalhada com hint de regenerar no Graph API Explorer.

---

## 2. Nova action `test_token` no edge function

Em `supabase/functions/instagram-proxy/index.ts`, adicionar action `test_token` que executa **3 chamadas em sequência** e retorna um relatório consolidado **sem** marcar `status=conectado` (isso continua sendo feito apenas por `test_connection` quando tudo passa):

1. **`/me?fields=id,name`** — valida que o token é parseável (resolve o erro 190).
2. **`/me/permissions`** — lista permissões concedidas; verifica presença obrigatória de:
   - `instagram_basic`
   - `instagram_manage_messages`
   - `pages_manage_metadata`
   - `pages_show_list`
   - (warning se faltar `pages_messaging`)
3. **`/{ig_user_id}?fields=username,name`** — confirma que o IG User ID pertence à página/token.

Resposta JSON:
```json
{
  "ok": true | false,
  "token_valid": true,
  "ig_account_valid": true,
  "permissions": { "granted": [...], "missing": [...], "declined": [...] },
  "ig_username": "minhaconta",
  "errors": []
}
```

Atualiza `instagram_config.ultimo_erro` com resumo legível e `ultima_verificacao_at`. Só seta `status=conectado` se `ok=true` **E** nenhuma permissão obrigatória ausente.

---

## 3. UI: botão "Testar token"

Em `InstagramConfig.tsx`, **antes** dos botões existentes:

- Novo botão **"Testar token e permissões"** (variant default, destacado) — chama `instagram-proxy` com `action: "test_token"`.
- Mostra um card de resultado abaixo, expandível, com:
  - Status do token (✓/✗)
  - Lista de permissões concedidas (badges verdes)
  - Lista de permissões faltando (badges vermelhos com link para regenerar)
  - Username IG detectado
  - Botão **"Ativar conexão"** habilitado **apenas** se `ok=true` — esse botão chama `test_connection` (que persiste `status=conectado`) e em seguida `subscribe_webhook` automaticamente.
- Os botões antigos "Testar conexão" e "Inscrever webhook" continuam disponíveis em modo avançado (collapse "Ações avançadas").

Estado local:
```ts
const [tokenTest, setTokenTest] = useState<TokenTestResult | null>(null);
```

---

## 4. Fluxo final do usuário

```text
1. Cola token → validação inline → Salvar
2. Clica "Testar token e permissões"
3. Vê relatório (token ok, permissões ok/faltando, IG resolvido)
4. Se tudo verde → "Ativar conexão" → status=conectado + webhook inscrito
5. Se faltar permissão → instrução para regenerar com escopos certos
```

---

## Arquivos afetados

- `src/pages/InstagramConfig.tsx` — validação inline, botão testar token, card de resultado, ativar conexão.
- `supabase/functions/instagram-proxy/index.ts` — action `test_token`, validação de token mais estrita (≥100 chars), checagem de permissões.
- (Opcional) `src/lib/instagram-token.ts` — helper `validateToken` reutilizável no front.

Nenhuma migração de banco é necessária.
