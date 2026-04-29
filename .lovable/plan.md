## Objetivo

No cadastro rápido do Caixa, quando um dos identificadores informados (CPF **ou** telefone) já pertencer a um contato existente — mas o outro estiver vazio nesse cadastro — propor a **junção/complemento** ao operador, ao invés de simplesmente carregar o contato como está hoje.

Cenário-alvo (ex.: Marco Arruda):
- Operador busca por CPF, não encontra, abre o modal "Novo cliente".
- Preenche **CPF + telefone**.
- O telefone já existe num cadastro sem CPF.
- Hoje: bloqueia ou apenas carrega o contato existente sem complementar.
- Desejado: perguntar "Encontramos um cliente com esse telefone (Marco Arruda). Deseja **adicionar o CPF** a esse cadastro?" — e ao confirmar, atualizar o contato existente e carregá-lo.

## Comportamento

A pré-checagem do dialog passa a buscar **separadamente** por CPF e por telefone para conseguir distinguir os casos:

| CPF informado | Tel. informado | Match por CPF | Match por Tel. | Ação |
|---|---|---|---|---|
| sim | sim | mesmo contato | mesmo contato | carrega existente (igual hoje) |
| sim | sim | A | B (≠ A) | erro: "CPF e telefone pertencem a clientes diferentes — corrija um dos campos" |
| — | sim | — | A sem CPF | (não muda nada, segue fluxo normal de carregar) |
| sim | sim | nenhum | A sem CPF | **propõe juntar**: "Este telefone já é do cliente A. Adicionar o CPF informado a esse cadastro?" |
| sim | sim | A sem tel. | nenhum | **propõe juntar**: "Este CPF já é do cliente A. Adicionar o telefone informado a esse cadastro?" |
| sim | sim | A com CPF | nenhum | carrega existente (CPF já confere, ignora telefone novo — alerta opcional) |
| sim | sim | nenhum | A com tel. divergente do informado | situação acima já tratada |

Regras de juntar:
- Apenas preenche **campos vazios** no contato existente (CPF se vazio, telefone se vazio). Nunca sobrescreve dado já existente.
- Nome/email/data_nascimento informados no modal **não** são aplicados ao contato existente (evita sobrescrever dados reais sem intenção). O operador continua o fluxo no Caixa normalmente; ajustes finos de cadastro ficam no módulo Contatos.
- Após o update, invalida queries `contatos` e `dashboard-contatos`, mostra toast de sucesso e chama `onCriado(contatoAtualizado)` para o caixa carregar o cliente.

## UI da proposta de junção

- Reaproveitar o componente `AlertDialog` (shadcn) dentro do `NovoContatoCaixaDialog`.
- Conteúdo:
  - Título: "Cliente existente encontrado"
  - Descrição: "Encontramos **{nome}** com {campo correspondente}: {valor mascarado}. Deseja adicionar o {campo a complementar} ({valor mascarado}) a esse cadastro?"
  - Botões: **Cancelar** (volta ao formulário) · **Sim, juntar e continuar** (executa update + carrega).
- Os valores no diálogo são exibidos com `mascararCPF` / `mascararTelefoneBR`.

## Tratamento do erro `23505` na inserção

Mantém-se como rede de segurança, mas agora com mais informação:
- Se houve violação de unicidade após a pré-checagem (corrida), refazer a busca separada e:
  - Se cair num caso "complementável", abrir o mesmo `AlertDialog` de junção.
  - Caso contrário, manter o comportamento atual (toast + carregar existente).

## Arquivos alterados

- `src/components/giftback/NovoContatoCaixaDialog.tsx`
  - Substitui o `or(...)` único por duas consultas (`cpf.eq.X` e `telefone.eq.Y`).
  - Lógica de decisão acima.
  - Novo `AlertDialog` controlado por estado local `propostaJuncao`.
  - Função `aplicarJuncao()` que faz o `UPDATE` no contato existente (apenas no campo vazio) e chama `onCriado`.

Sem mudanças de schema, RLS ou edge functions. As policies atuais já permitem `UPDATE` em `contatos` pelo mesmo tenant.

## Fora do escopo

- Mesclar dois contatos distintos (com históricos diferentes). Isso é uma fusão real e fica para uma ferramenta dedicada em Contatos.
- Editar nome/email/nascimento do contato existente a partir do modal do caixa.
