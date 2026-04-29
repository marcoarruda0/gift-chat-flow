## Cadastro rápido de cliente no Painel do Caixa (Giftback)

Hoje, em **Giftback → Painel do Caixa**, ao buscar um CPF/telefone que não existe, aparece apenas um toast "Contato não encontrado" e o operador precisa sair do fluxo, ir até o módulo Contatos e cadastrar. O objetivo é permitir o cadastro **na hora**, sem sair do caixa.

### Comportamento proposto

1. Operador digita CPF ou telefone em `GiftbackCaixa` e clica em buscar.
2. Se a busca retornar nada:
   - Substituir o toast atual por um **bloco inline** abaixo da busca: "Cliente não encontrado. Deseja cadastrar agora?" + botão **"Cadastrar novo cliente"**.
   - O termo digitado é preservado (não é apagado).
3. Ao clicar no botão, abre um **dialog** ("Novo cliente") com formulário enxuto:
   - **Nome** (obrigatório)
   - **CPF** e **Telefone** (pelo menos um obrigatório; o que foi digitado na busca já vem pré-preenchido — detecta se é CPF apenas-dígitos com 11 chars vs telefone)
   - **E-mail** (opcional)
   - **Data de nascimento** (opcional)
4. Ao salvar:
   - Insere em `contatos` com `tenant_id` do operador (mesmo padrão usado em `src/pages/Contatos.tsx`, com `saldo_giftback = 0`, `campos_personalizados = {}`, `tags = []`).
   - Fecha o dialog, **carrega automaticamente o contato recém-criado** no painel (mesma estrutura que `buscarContato` usa) e segue o fluxo normal de registrar a compra.
   - Como a inserção usa `tenant_id` correto, o contato já aparece em **Contatos** sem nenhuma ação adicional (RLS por tenant garante isso).
5. Validações:
   - Antes de inserir, conferir duplicidade por CPF ou telefone (`select id from contatos where cpf = ? or telefone = ?`) — se já existir, carrega o existente em vez de duplicar.
   - Validação client-side com zod (nome ≤100, e-mail válido se preenchido, CPF/telefone só dígitos).

### Mudanças técnicas

- **Novo componente**: `src/components/giftback/NovoContatoCaixaDialog.tsx`
  - Props: `open`, `onOpenChange`, `valorBuscado` (string), `onCriado(contato)`.
  - Usa `Dialog`, `Input`, `Label`, `Button` do shadcn + `react-hook-form` + `zod`.
  - Faz o insert e devolve o objeto `Contato` no shape esperado pelo caixa.
- **`src/pages/GiftbackCaixa.tsx`**:
  - Adicionar estado `naoEncontrado: boolean` e `dialogNovoOpen: boolean`.
  - Em `buscarContato`, quando `!cData`, em vez do toast destrutivo, setar `naoEncontrado=true` e limpar `contato`.
  - Renderizar bloco inline com `AlertTriangle` + botão "Cadastrar novo cliente" logo abaixo do `Card` de busca.
  - Callback `onCriado` carrega o contato (reaproveitar lógica de busca já existente) e zera `naoEncontrado`.
  - Invalidar `queryClient.invalidateQueries({ queryKey: ["contatos"] })` para refletir no módulo Contatos.

### Sem mudanças necessárias

- Banco/RLS: a tabela `contatos` já permite insert por tenant (`tenant_insert_contacts`).
- Módulo Contatos: o novo registro aparece automaticamente porque compartilha `tenant_id`.

### Diagrama do fluxo

```text
[Buscar CPF/tel] -> encontrou? --sim--> fluxo atual (registrar compra)
                          \
                           --não--> [Aviso inline + botão "Cadastrar"]
                                          |
                                     [Dialog Novo Cliente]
                                          |
                                     [Salvar -> contatos]
                                          |
                                  [Carrega contato no caixa]
                                          |
                                     fluxo atual
```

Posso seguir com a implementação?