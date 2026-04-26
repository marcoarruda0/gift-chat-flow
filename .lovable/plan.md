
# Módulo Campanhas — 3 melhorias

## 1) Search box na seleção manual

**Onde:** `src/pages/Campanhas.tsx`, dentro do bloco `tipoFiltro === "manual"` (linhas 971-984).

**O que muda:**
- Adicionar estado local `manualSearch` (string).
- Acima da lista de checkboxes, renderizar um `<Input>` com ícone de lupa, placeholder "Buscar por nome, telefone ou e-mail…".
- Filtrar `contatos.filter(hasContact)` aplicando match case-insensitive em `nome`, `telefone` e `email`.
- Mostrar contador "X de Y exibidos · Z selecionados" abaixo do campo, e um botão "Limpar seleção" quando houver selecionados.
- Aumentar a altura útil da lista (de `max-h-40` para `max-h-64`) para caber melhor com a barra de busca.
- A busca **não desmarca** contatos já selecionados que saiam do filtro — eles continuam contando.

**Resetar `manualSearch`** dentro de `resetForm()` e ao trocar o `tipoFiltro`.

---

## 2) Tela/Diálogo de teste para WhatsApp Oficial

**Objetivo:** antes de criar a campanha em massa, permitir disparar **um envio único de teste** para um número informado pelo usuário, exibindo:
- O **canal** usado (`whatsapp_cloud`).
- O **payload exato** que será enviado à Meta (template + components com variáveis substituídas).
- O **status HTTP / resposta** da Meta (sucesso, `wa_message_id`, ou erro detalhado).

**Componente novo:** `src/components/campanhas/TestarCampanhaCloudDialog.tsx`
- Props: `open`, `onOpenChange`, `templateName`, `templateLanguage`, `templateComponents`, `templateVariaveis`, `sampleContact` (para mostrar como ficariam variáveis dinâmicas tipo `{nome}`).
- Campos:
  - Telefone de teste (obrigatório, com máscara internacional simples).
  - Botão "Enviar teste".
- Áreas exibidas:
  - **Canal**: badge "WhatsApp Oficial (Cloud API)".
  - **Payload (preview)**: bloco `<pre>` com JSON formatado mostrando `{ to, type: "template", template: { name, language, components } }` que será enviado.
  - **Resultado**: após o clique, mostra status (loading / sucesso / erro), `wa_message_id`, e mensagem de erro bruta da Meta se houver.

**Edge function nova:** `supabase/functions/enviar-teste-campanha-cloud/index.ts`
- Recebe `{ telefone, template_name, template_language, template_components, template_variaveis }`.
- Valida JWT do usuário (segue padrão das demais functions oficiais).
- Carrega `whatsapp_cloud_config` do tenant do usuário.
- Reaproveita a lógica de `montarComponentsTemplate` (extrair função utilitária ou duplicar — manter consistência com `enviar-campanha-cloud`).
- Faz POST para `https://graph.facebook.com/v20.0/{phone_id}/messages`.
- Retorna `{ ok, payload_enviado, response, wa_message_id?, error? }`.
- **Não** grava nada em `campanha_destinatarios` nem em `campanhas` — é apenas teste.

**Integração na UI (`Campanhas.tsx`):**
- Quando `canal === "whatsapp_cloud"` e há `templateId` selecionado, renderizar um botão secundário **"Testar disparo"** ao lado do botão "Criar Campanha" no `DialogFooter`, abrindo o `TestarCampanhaCloudDialog`.

---

## 3) Grupos de Campanhas

**Conceito:** rótulo opcional aplicado a uma campanha para agrupar várias campanhas relacionadas (ex.: "Black Friday 2026", "Lançamento coleção Verão"). Usado depois para análise consolidada.

### 3.1 Banco de dados

**Tabela nova:** `public.campanha_grupos`
| coluna | tipo | observações |
|---|---|---|
| id | uuid PK default gen_random_uuid() | |
| tenant_id | uuid NOT NULL | |
| nome | text NOT NULL | |
| descricao | text | |
| cor | text | hex opcional para badge |
| created_at | timestamptz default now() | |
| updated_at | timestamptz default now() | |

- Unique `(tenant_id, lower(nome))` para evitar duplicados.
- RLS: SELECT por tenant; INSERT/UPDATE/DELETE para `admin_tenant` ou `admin_master` (mesmo padrão de `departamentos`).

**Coluna nova em `campanhas`:** `grupo_id uuid NULL` (sem FK para evitar cascade surpresa; integridade tratada na UI). Index em `(tenant_id, grupo_id)` para análises.

Migração SQL única:
```sql
CREATE TABLE public.campanha_grupos (...);
ALTER TABLE public.campanhas ADD COLUMN grupo_id uuid;
CREATE INDEX idx_campanhas_grupo ON public.campanhas(tenant_id, grupo_id);
-- RLS policies
```

### 3.2 UI — Gestão de grupos

**Componente novo:** `src/components/campanhas/GerenciarGruposDialog.tsx`
- Botão "Gerenciar grupos" no header da página `Campanhas.tsx` (ao lado de "Nova Campanha").
- Lista grupos do tenant com ações inline: editar nome/descrição/cor, excluir (com confirmação — ao excluir, `UPDATE campanhas SET grupo_id = NULL WHERE grupo_id = …`).
- Form simples: nome, descrição (opcional), cor (color picker básico ou paleta de 8 cores).

### 3.3 UI — Atribuir grupo na criação da campanha

No `Dialog` de Nova Campanha (`Campanhas.tsx`):
- Adicionar campo **"Grupo"** abaixo de "Nome da campanha":
  - `<Select>` com grupos existentes + opção "Sem grupo" + opção "+ Criar novo grupo…" (abre mini-prompt inline ou o `GerenciarGruposDialog`).
- Persistir `grupo_id` no INSERT.

### 3.4 UI — Tabela de campanhas

- Adicionar coluna **"Grupo"** entre "Nome" e "Canal", exibindo um Badge com a cor do grupo (ou `—`).
- Adicionar **filtro por grupo** ao lado das tabs de canal: `<Select>` "Todos os grupos" / lista de grupos.
- Permitir **editar grupo** de uma campanha existente: ícone de tag na coluna Ações abre um popover com select para reatribuir.

### 3.5 Análise (futuro / fora deste escopo)

Esta entrega cria a infra (tabela + coluna + UI). Relatórios consolidados por grupo (somar `total_enviados`, `total_falhas`, taxas de entrega/leitura, receita influenciada) ficam para uma próxima iteração. Documentar no `mem://features/roadmap`.

---

## Arquivos afetados

**Novos:**
- `supabase/migrations/<timestamp>_campanha_grupos.sql`
- `supabase/functions/enviar-teste-campanha-cloud/index.ts`
- `src/components/campanhas/TestarCampanhaCloudDialog.tsx`
- `src/components/campanhas/GerenciarGruposDialog.tsx`

**Modificados:**
- `src/pages/Campanhas.tsx` — search manual, botão "Testar disparo", coluna grupo, filtro por grupo, select de grupo no form.

**Memória:**
- Atualizar `mem://features/roadmap` com nota sobre grupos e teste de Oficial.

## Verificação pós-deploy

1. **Search manual:** abrir Nova Campanha, escolher "Seleção manual", digitar parte de um nome/telefone — lista filtra em tempo real, seleções permanecem.
2. **Teste Oficial:** com WhatsApp Oficial conectado e template selecionado, clicar "Testar disparo", informar número próprio, ver payload + receber mensagem real no WhatsApp + ver `wa_message_id` na resposta.
3. **Grupos:** criar grupo "Teste 2026", criar campanha atribuindo o grupo, ver badge na tabela, filtrar por grupo, editar grupo de outra campanha existente.
