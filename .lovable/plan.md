
# Diagnóstico do erro ao clicar em "Testar Conexão"

## O que eu verifiquei
Encontrei 2 chamadas diferentes para a mesma function:

1. `fetch_pendentes` disparada automaticamente pelo Dashboard  
   - `POST /functions/v1/pinoquio-sync`
   - body: `{"tenant_id":"...","action":"fetch_pendentes"}`
   - resposta: `500 {"error":"Pinóquio API error: 401 Unauthorized"}`

2. `test_connection` disparada pelo botão "Testar Conexão"  
   - `POST /functions/v1/pinoquio-sync`
   - body: `{"tenant_id":"...","action":"test_connection"}`
   - resposta: `200 {"ok":false,"error":"HTTP 401: {\"message\":\"Unauthorized\"}"}`

## O erro, detalhado
O problema real não é na conexão com o backend da plataforma nem na Z-API. O erro vem da API externa do Pinóquio recusando a autenticação.

Em termos práticos:
- a function está conseguindo ler a configuração do tenant
- ela está chegando até a API do Pinóquio
- o Pinóquio está respondendo `401 Unauthorized`

Ou seja: o JWT enviado ao Pinóquio está inválido para essa API, ou está sendo enviado no formato errado.

## Pontos importantes no código que explicam isso

### 1) O botão "Testar Conexão" não usa o JWT digitado na tela
Em `src/pages/PecaRara.tsx`, o botão envia apenas:
```ts
{ tenant_id, action: "test_connection" }
```
Então a function lê o JWT salvo no banco, e não o valor que está no input naquele momento.

Impacto:
- se você colou um JWT novo e clicou direto em "Testar Conexão" sem salvar antes, o teste usa o token antigo
- isso explica perfeitamente erros como "JWT não configurado" ou `401` mesmo após colar um token novo

### 2) O sanitizador atual do JWT é incompleto
Em `supabase/functions/pinoquio-sync/index.ts`, a função:
- remove espaços/quebras de linha
- tenta decodificar base64 se não começar com `eyJ`

Mas ela não remove:
- prefixo `Bearer `
- aspas extras
- outros formatos comuns de cola/copiar

Se o usuário colar:
```text
Bearer eyJ...
```
o header final vira:
```text
Authorization: Bearer Bearer eyJ...
```
e isso gera `401`.

### 3) O Dashboard faz chamada automática e gera um segundo erro
Ao abrir `/peca-rara`, a aba Dashboard tenta buscar pendentes automaticamente se existir qualquer `jwt_token` salvo.

Então hoje acontecem dois comportamentos ao mesmo tempo:
- o Dashboard tenta `fetch_pendentes` e pode estourar `500`
- o botão "Testar Conexão" retorna `ok:false` com `401`

Isso deixa a percepção confusa, porque parece que o clique no botão causou tudo, mas há uma chamada automática em paralelo.

## Conclusão do diagnóstico
A causa mais provável está em uma destas 3 situações:

1. O JWT novo foi digitado mas não salvo antes do teste  
2. O JWT salvo está com formato incorreto, especialmente com `Bearer ` na frente  
3. O JWT salvo realmente não é aceito pela API do Pinóquio

## Plano de correção
Sem alterar banco, eu corrigiria assim:

1. Em `src/pages/PecaRara.tsx`
   - fazer "Testar Conexão" usar os valores atuais do formulário
   - ou salvar automaticamente antes de testar
   - mostrar mensagem clara quando houver alterações não salvas

2. Em `supabase/functions/pinoquio-sync/index.ts`
   - melhorar a normalização do token:
     - trim
     - remover `Bearer ` no início
     - remover aspas
     - remover quebras de linha
     - continuar tentando base64 quando fizer sentido
   - validar formato mínimo do JWT antes de chamar o Pinóquio

3. Ainda na function
   - tratar `401` de forma estruturada, sem virar erro genérico
   - retornar diagnóstico amigável, por exemplo:
     - token ausente
     - token salvo mas inválido
     - token com prefixo `Bearer`
     - token malformado

4. No Dashboard
   - evitar auto-fetch agressivo quando a conexão ainda não foi validada
   - ou exibir erro inline em vez de deixar a chamada parecer falha crítica

## Ajuste de UX que eu recomendo
Além da correção técnica, eu deixaria a tela de Configuração assim:
- botão "Salvar Configuração"
- botão "Testar Conexão"
- aviso: "O teste usa os dados salvos" ou então o teste passa a usar os dados atuais
- botão mostrar/ocultar JWT para facilitar conferência visual

## O que isso deve resolver
Depois dessa correção, o usuário vai conseguir distinguir claramente entre:
- JWT não salvo
- JWT mal formatado
- JWT inválido no Pinóquio

E o módulo deixará de disparar `500` confuso só porque o Dashboard tentou carregar antes da validação.

## Arquivos envolvidos
- `src/pages/PecaRara.tsx`
- `supabase/functions/pinoquio-sync/index.ts`

## Validação manual depois da correção
1. Colar JWT cru começando com `eyJ...`
2. Testar conexão sem salvar
3. Testar conexão após salvar
4. Testar também com valor colado como `Bearer eyJ...`
5. Confirmar que o sistema mostra diagnóstico correto e não gera `500` confuso no Dashboard
