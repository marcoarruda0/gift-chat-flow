

# Módulo Base de Conhecimento

## Objetivo
Criar um módulo onde o tenant cadastra informações (perguntas/respostas, documentos, textos) que a IA usará para responder automaticamente nas conversas do WhatsApp.

## Arquitetura

```text
┌─────────────────────────────────────────────┐
│  UI: /conhecimento                          │
│  - Lista de artigos/entradas                │
│  - CRUD: título, conteúdo, categoria, tags  │
│  - Busca/filtro                             │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  Tabela: conhecimento_base                  │
│  id, tenant_id, titulo, conteudo,           │
│  categoria, tags[], ativo, created/updated  │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  Edge Function: ai-responder                │
│  Recebe pergunta → busca artigos do tenant  │
│  → monta contexto → chama Lovable AI       │
│  → retorna resposta                         │
└─────────────────────────────────────────────┘
```

## Alterações

### 1. Migration — Tabela `conhecimento_base`
```sql
CREATE TABLE public.conhecimento_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  titulo text NOT NULL,
  conteudo text NOT NULL,
  categoria text DEFAULT 'geral',
  tags text[] DEFAULT '{}',
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.conhecimento_base ENABLE ROW LEVEL SECURITY;

-- RLS: tenant isolation
CREATE POLICY "tenant_view_kb" ON public.conhecimento_base FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_insert_kb" ON public.conhecimento_base FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_update_kb" ON public.conhecimento_base FOR UPDATE USING (tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_delete_kb" ON public.conhecimento_base FOR DELETE USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Trigger updated_at
CREATE TRIGGER update_conhecimento_base_updated_at
  BEFORE UPDATE ON public.conhecimento_base
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2. Página `src/pages/Conhecimento.tsx`
- Layout com lista de artigos à esquerda e editor à direita (ou modal)
- Cards com título, categoria (badge), status ativo/inativo
- Formulário: título, conteúdo (textarea grande), categoria (select), tags
- Busca por texto no título/conteúdo
- Toggle ativo/inativo por artigo
- Botão de excluir com confirmação
- Usa `useQuery`/`useMutation` seguindo padrão do GiftbackConfig

### 3. Edge Function `supabase/functions/ai-responder/index.ts`
- Recebe `{ pergunta, tenant_id }` via POST
- Busca todos os artigos ativos do tenant (`conhecimento_base` WHERE `ativo = true`)
- Monta prompt com contexto dos artigos
- Chama Lovable AI Gateway (google/gemini-2.5-flash) para gerar resposta
- Retorna `{ resposta, fontes: [títulos dos artigos usados] }`
- Será chamada futuramente pelo webhook para auto-resposta (integração posterior)

### 4. Rota no `App.tsx`
- Trocar o `Placeholder` do `/conhecimento` pelo novo componente `Conhecimento`

### 5. Atualizar sidebar
- O item "Base de Conhecimento" já existe no `AppSidebar.tsx`, apenas a rota precisa apontar para o componente real

## Categorias padrão sugeridas
- Produtos/Serviços
- Políticas (troca, devolução, garantia)
- Horários/Localização
- Pagamentos
- FAQ Geral

## Arquivos criados/alterados
| Arquivo | Tipo |
|---------|------|
| Migration (conhecimento_base) | Novo |
| `src/pages/Conhecimento.tsx` | Novo |
| `supabase/functions/ai-responder/index.ts` | Novo |
| `src/App.tsx` | Alterado (rota) |

