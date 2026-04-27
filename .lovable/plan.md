
## Plano de implementação

### 1. `IAConfig.tsx` — Card "Modo Copiloto" (UI completa)

Adicionar novo card entre **Resposta Automática** e **Personalidade** com:

- **Switch "Copiloto ativo"** (`copiloto_ativo` em `ia_config`).
  - Texto explicativo: *"Quando ativo, a IA gera rascunhos para o atendente revisar em vez de responder sozinha. A resposta automática fica desabilitada."*
- **Seleção de canais** com checkboxes (`copiloto_canais`):
  - ☑ WhatsApp Z-API (`whatsapp_zapi`)
  - ☑ WhatsApp Cloud (`whatsapp_cloud`)
- Aviso visual quando ambos `ativo` (resposta automática) e `copiloto_ativo` estiverem ligados, explicando que o copiloto tem prioridade.

### 2. `IAConfig.tsx` — Persistência

Atualizar `handleSave` para incluir no payload:
- `copiloto_ativo`
- `copiloto_canais`

Carregar no `useEffect` inicial:
- `copiloto_ativo`, `copiloto_canais`, `ultima_analise_em`, `ultima_analise_resumo`.

### 3. `IAConfig.tsx` — Card "Análise de conversas"

Novo card abaixo de Instruções Personalizadas com:

- **Período**: 2 inputs de data (default = últimos 30 dias).
- Botão **"🔍 Analisar conversas"** que chama `supabase.functions.invoke("ia-analisar-conversas", { body: { periodo_inicio, periodo_fim } })`.
- Estado de loading (`analisando`) com `Loader2` animado e texto *"Varrendo conversas, isto pode levar 1–2 minutos…"*.
- Após sucesso:
  - **Resumo em markdown** renderizado com `ReactMarkdown` em uma área scrollável (`max-h-96`).
  - **Sugestões de instruções** em bloco destacado (bg-muted) com:
    - Botão **"✨ Aplicar sugestões"** → mostra `AlertDialog` perguntando se quer **substituir** ou **acrescentar** ao final das `instrucoesExtras` atuais; ao confirmar, atualiza o estado local + auto-salva no banco.
    - Botão **"Copiar"** alternativo.
- Mostrar `ultima_analise_em` formatada quando disponível ao abrir a tela.
- Listar últimas 3 análises (query em `ia_analises_conversas` ordenado por `created_at desc limit 3`) com badge de status e botão "Ver" para reabrir o resumo daquela análise.

### 4. Nova migration — Auto-marcar **Cliente** quando giftback é gerado

Criar trigger Postgres em `giftback_movimentos`:

```sql
CREATE OR REPLACE FUNCTION public.marcar_contato_cliente_on_giftback()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Apenas para movimentos do tipo 'credito' (giftback gerado)
  IF NEW.tipo = 'credito' AND NEW.contato_id IS NOT NULL THEN
    UPDATE public.contatos
    SET campos_personalizados =
      COALESCE(campos_personalizados, '{}'::jsonb)
      || jsonb_build_object('cliente', true),
      updated_at = now()
    WHERE id = NEW.contato_id
      AND tenant_id = NEW.tenant_id
      AND COALESCE((campos_personalizados->>'cliente')::boolean, false) = false;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_marcar_cliente_on_giftback
AFTER INSERT ON public.giftback_movimentos
FOR EACH ROW
EXECUTE FUNCTION public.marcar_contato_cliente_on_giftback();
```

**Backfill** (executado na mesma migration via `INSERT/UPDATE` puro — uma única `UPDATE` em `contatos` para todos os IDs distintos com giftback `credito` existentes):

```sql
UPDATE public.contatos c
SET campos_personalizados =
  COALESCE(campos_personalizados, '{}'::jsonb)
  || jsonb_build_object('cliente', true),
  updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM public.giftback_movimentos gm
  WHERE gm.contato_id = c.id
    AND gm.tenant_id = c.tenant_id
    AND gm.tipo = 'credito'
)
AND COALESCE((campos_personalizados->>'cliente')::boolean, false) = false;
```

### 5. Garantir que o campo "cliente" exista em `contato_campos_config`

Na mesma migration, fazer `INSERT … ON CONFLICT DO NOTHING` para cada tenant que ainda não tenha o campo `cliente` cadastrado, para que apareça no formulário de edição de contato.

### Arquivos afetados
- ✏️ `src/pages/IAConfig.tsx` — UI completa do Copiloto + análise + apply.
- 🆕 `supabase/migrations/<timestamp>_auto_marcar_cliente_giftback.sql` — trigger + função + backfill + garantia de campo.

### Fora de escopo (já entregue na iteração anterior)
- Backend `ia-gerar-rascunho`, `ia-analisar-conversas`.
- Integração de rascunho em `ChatInput`/`Conversas`.
