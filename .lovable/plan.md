

## Plano: Renomear Disparos → Campanhas + Campanhas por Email

### 1. Rename "Disparos" → "Campanhas"
- `src/components/AppSidebar.tsx`: label "Disparos" → "Campanhas", manter rota `/disparos` (redirecionar) ou trocar para `/campanhas`
- `src/App.tsx`: adicionar rota `/campanhas` apontando para o componente; manter `/disparos` com `<Navigate to="/campanhas" replace />` para não quebrar links salvos
- Renomear `src/pages/Disparos.tsx` → `src/pages/Campanhas.tsx` (todos os textos PT-BR: "Nova Campanha" já existe, "Disparos" → "Campanhas" no header/breadcrumb)
- Atualizar título da página, toast messages, labels

### 2. Novo campo "canal" nas campanhas
Migration:
```sql
ALTER TABLE campanhas ADD COLUMN canal text NOT NULL DEFAULT 'whatsapp';
-- valores: 'whatsapp' | 'email'
ALTER TABLE campanhas ADD COLUMN email_assunto text;
ALTER TABLE campanhas ADD COLUMN email_html text;
ALTER TABLE campanhas ADD COLUMN email_preview text;
```
Filtros (`filtro_tipo`, `filtro_valor`) e destinatários (`campanha_destinatarios`) **continuam iguais** — só muda o canal de envio. Para email, o destinatário usará `contatos.email` em vez de `telefone`.

### 3. UI — Wizard de campanha com seletor de canal
No `<NovaCampanhaDialog>` (ou seção equivalente em Campanhas.tsx):
- **Step 1 — Canal**: 2 cards grandes ("WhatsApp" / "E-mail")
- **Step 2 — Filtros**: reaproveita 100% o que já existe (RFV/Segmento, Tags, Seleção individual). Para email, validar que contato tem `email` preenchido (mostrar contador "X com email / Y total")
- **Step 3 — Conteúdo**:
  - Se WhatsApp: form atual (mensagem + mídia)
  - Se Email: novo form com Assunto + Preview text + Editor rich-text
- **Step 4 — Agendamento/Envio**: igual hoje

### 4. Editor de email
Usar **Tiptap** (já compatível com React/Vite, sem dependências pesadas) com extensions: bold, italic, underline, link, headings, lista, imagem (URL), align, color. Toolbar customizada estilo shadcn. Output HTML salvo em `email_html`.

Pacotes: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-image`, `@tiptap/extension-text-align`, `@tiptap/extension-color`.

Componente novo: `src/components/campanhas/EmailEditor.tsx` — toolbar + EditorContent + preview ao lado.

Variáveis suportadas: `{nome}`, `{telefone}`, `{email}` (substituídas no envio).

### 5. Backend — envio de email
Como o usuário ainda não configurou domínio de email, primeiro mostro o setup dialog. Após domínio configurado:
- `email_domain--setup_email_infra` (cria queue + tabelas)
- `email_domain--scaffold_transactional_email` (cria edge function `send-transactional-email`)
- Criar nova edge function `enviar-campanha-email` que:
  - Recebe `campanha_id`, busca destinatários pendentes
  - Para cada destinatário com email válido, invoca `send-transactional-email` com:
    - `templateName: 'campaign-broadcast'` (template genérico que aceita HTML pronto via templateData)
    - `templateData: { html, subject, name }`
    - `idempotencyKey: campanha-${campanha_id}-${dest_id}`
  - Marca destinatários como `enviado`/`falha` em `campanha_destinatarios`
  - Atualiza contadores `total_enviados`/`total_falhas` em `campanhas`
- Criar template `campaign-broadcast.tsx` em `_shared/transactional-email-templates/` que renderiza o HTML do editor dentro de um wrapper React Email com header/footer da marca

⚠️ Nota: o sistema rotula isso como "transactional" tecnicamente para usar a infra do Lovable, mas conceitualmente é broadcast — vou validar com você se é melhor usar Resend direto (mais adequado para campanhas) ou seguir com a infra Lovable.

### 6. Visualização de campanhas
Lista atual já mostra status/canal. Adicionar **badge de canal** (📱 WhatsApp / ✉️ Email) em cada card. Filtro de tab "Todas | WhatsApp | Email".

### Arquivos afetados
| Arquivo | Mudança |
|---|---|
| Migration | `campanhas` ganha `canal`, `email_assunto`, `email_html`, `email_preview` |
| `src/components/AppSidebar.tsx` | Label "Campanhas" |
| `src/App.tsx` | Rota `/campanhas` + redirect `/disparos` |
| `src/pages/Campanhas.tsx` (rename de Disparos.tsx) | Wizard com step de canal, badge de canal na lista, filtro por canal |
| `src/components/campanhas/EmailEditor.tsx` (novo) | Tiptap editor com toolbar |
| `supabase/functions/_shared/transactional-email-templates/campaign-broadcast.tsx` (novo) | Template wrapper |
| `supabase/functions/enviar-campanha-email/index.ts` (novo) | Drainer da fila para canal email |
| `package.json` | +tiptap deps |

### Pré-requisito de email
Domínio de email não configurado ainda. Vou pedir para configurar primeiro:

<lov-actions>
<lov-open-email-setup>Configurar domínio de email</lov-open-email-setup>
<lov-suggestion message="Teste end-to-end: crie uma campanha WhatsApp e uma campanha Email para 1 contato e verifique a entrega">Testar campanhas end-to-end</lov-suggestion>
<lov-suggestion message="Adicionar templates de email prontos (boas-vindas, recuperação carrinho, aniversário) selecionáveis no editor">Templates de email prontos</lov-suggestion>
<lov-suggestion message="Adicionar suporte a SMS como terceiro canal de campanha (via Twilio ou conector)">Adicionar canal SMS</lov-suggestion>
<lov-suggestion message="Adicionar A/B test de assunto em campanhas de email (envia 2 versões para 10% e usa a vencedora nos 90% restantes)">A/B test de assunto</lov-suggestion>
</lov-actions>

