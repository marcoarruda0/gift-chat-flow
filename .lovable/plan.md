

# Plano: Habilitar envio real de e-mail + Botão "Inserir variável"

## Pré-requisito: Configurar domínio de e-mail

Ainda não há domínio de e-mail configurado no projeto. Esse é o **primeiro passo** — sem ele a edge function de envio não funciona. Após você configurar o domínio (link abaixo), continuo automaticamente com o resto.

## Parte 1 — Infra de e-mail e edge function `enviar-campanha-email`

### Passos automáticos após o domínio estar configurado

1. **Setup de infra de e-mail** (cria filas pgmq, tabelas de log/supressão, cron)
2. **Scaffold de transactional email** (cria `send-transactional-email`, `handle-email-unsubscribe`, `handle-email-suppression`)
3. **Criar template `campaign-broadcast`** em `supabase/functions/_shared/transactional-email-templates/campaign-broadcast.tsx`:
   - Recebe `subject`, `html` (HTML do editor), `signature` (assinatura HTML do tenant), `fromName` como props
   - Renderiza com React Email mantendo wrapper de marca (Body branco, Container 600px)
   - Injeta `html` via componente React (não com `dangerouslySetInnerHTML`)
   - Registra no `registry.ts` com `previewData` realista
4. **Criar página de unsubscribe** em `src/pages/EmailUnsubscribe.tsx` + rota `/unsubscribe` em `App.tsx` (valida token via GET, confirma via POST, segue padrão da plataforma)

### Edge function `enviar-campanha-email` (nova)

Cria `supabase/functions/enviar-campanha-email/index.ts` seguindo o mesmo padrão chunked/fire-and-forget de `enviar-campanha`:

- Recebe `{ campanha_id, internal?, remaining_delay_ms? }`
- Auth: chamada externa via JWT do usuário; chamadas internas via service role
- Busca campanha + tenant (`email_remetente_nome`, `email_remetente_local`, `email_assinatura`)
- Para cada destinatário pendente (1 por invocação):
  - Substitui variáveis em `email_html` e `email_assunto`: `{nome}`, `{email}`, `{telefone}`
  - Invoca `send-transactional-email` com:
    ```
    templateName: 'campaign-broadcast'
    recipientEmail: dest.telefone (que guarda o email para canal=email)
    idempotencyKey: `campanha-${campanha_id}-${dest.id}`
    templateData: { subject, html, signature, fromName, name }
    ```
  - Marca `enviado` ou `falha` em `campanha_destinatarios`
  - Atualiza contadores em `campanhas`
- Aplica delay (`atraso_tipo`) entre envios igual ao WhatsApp
- Encadeia próxima invocação se houver mais pendentes; marca `concluida` quando acabar

### Front: liberar envio de e-mail

`src/pages/Campanhas.tsx` → função `enviarCampanha`:
- Troca o erro "Envio de e-mail ainda não está disponível" por chamada real:
  ```
  if (campanhaCanal === "email") {
    await supabase.functions.invoke("enviar-campanha-email", { body: { campanha_id } })
  } else {
    await supabase.functions.invoke("enviar-campanha", { body: { campanha_id } })
  }
  ```

⚠️ **Sobre uso de "transactional" para campanha**: A infra Lovable Email é tecnicamente para transactional (1:1, gatilho do usuário). Campanhas são broadcast (1:N). Vou usar a infra mesmo assim porque:
1. Cada destinatário é tratado individualmente (1 invocação por contato), não é loop massivo
2. Cada `idempotencyKey` é único por destinatário
3. Você já tem opt-in dos contatos (cadastrados manualmente/via WhatsApp)
4. O footer de unsubscribe é adicionado automaticamente, mantendo conformidade

Se preferir Resend dedicado para evitar qualquer risco de reputação no domínio compartilhado, me avise antes de eu começar.

## Parte 2 — Botão "Inserir variável" no editor

`src/components/campanhas/EmailEditor.tsx`:

- Adiciono novo botão na toolbar do Tiptap entre "Cor" e "Undo": ícone `Variable` (lucide) em DropdownMenu
- Opções no dropdown:
  - `{nome}` — Nome do contato
  - `{email}` — E-mail do contato
  - `{telefone}` — Telefone do contato
  - `{empresa}` — Nome da sua empresa (do tenant)
- Ao clicar, insere o token na posição do cursor via `editor.chain().focus().insertContent('{nome}').run()`
- Tooltip explicando "Variáveis são substituídas pelos dados do contato no envio"
- A legenda atual abaixo do editor (`Variáveis: {nome} {email}`) é removida (substituída pelo botão)

Mesma funcionalidade espelhada no campo de assunto (input simples): adiciono um pequeno botão "Inserir variável" ao lado do campo `email_assunto` em `Campanhas.tsx` que abre o mesmo dropdown e insere no input.

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| Domínio de e-mail | Configurado via dialog (pré-requisito) |
| Infra de e-mail (auto) | Filas, log, supressão, cron, template registry |
| `supabase/functions/_shared/transactional-email-templates/campaign-broadcast.tsx` (novo) | Template React Email para broadcast |
| `supabase/functions/_shared/transactional-email-templates/registry.ts` | +import e entrada `'campaign-broadcast'` |
| `supabase/functions/enviar-campanha-email/index.ts` (novo) | Drainer que invoca `send-transactional-email` por destinatário |
| `src/pages/EmailUnsubscribe.tsx` (novo) | Página de unsubscribe branded |
| `src/App.tsx` | Rota `/unsubscribe` |
| `src/pages/Campanhas.tsx` | `enviarCampanha` chama nova função para canal email; botão de variável no input de assunto |
| `src/components/campanhas/EmailEditor.tsx` | Dropdown "Inserir variável" na toolbar |

## Resultado

- **Envio real de e-mail** funcionando: campanhas com canal=email são enviadas via Lovable Email com fila, retry, supressão e unsubscribe automáticos
- **Variáveis 1-clique**: editor e assunto ganham dropdown que insere `{nome}`, `{email}`, `{telefone}`, `{empresa}` na posição do cursor
- Personalização real por destinatário: cada e-mail recebe nome/email/telefone substituídos antes do envio

<lov-actions>
<lov-open-email-setup>Configurar domínio de e-mail</lov-open-email-setup>
<lov-suggestion message="Teste end-to-end: configure o domínio, crie uma campanha de e-mail com {nome} no corpo e envie pra 1 contato seu pra ver chegando">Verificar envio real end-to-end</lov-suggestion>
<lov-suggestion message="Quero usar Resend dedicado em vez da infra Lovable Email pra campanhas (separar reputação de domínio entre transacional e broadcast)">Usar Resend para campanhas</lov-suggestion>
<lov-suggestion message="Adicionar templates de e-mail prontos (boas-vindas, recuperação de carrinho, aniversário) selecionáveis no editor">Templates de e-mail prontos</lov-suggestion>
<lov-suggestion message="Mostrar estatísticas de entrega no detalhe da campanha (entregues, abertos, cliques, bounces) puxando do email_send_log">Métricas de entrega de e-mail</lov-suggestion>
</lov-actions>

