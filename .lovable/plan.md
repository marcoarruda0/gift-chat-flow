## Transcrição automática de áudios em conversas

Adicionar transcrição automática (texto) sob cada mensagem de áudio nas conversas, para que atendentes em PCs sem fone consigam ler o que o cliente disse. A transcrição roda no backend via Lovable AI (Gemini multimodal), é armazenada na própria mensagem e renderizada no balão do chat com opção de copiar.

---

### 1. Comportamento esperado (UX)

- Toda nova mensagem de áudio recebida (Z-API ou WhatsApp Cloud) é enfileirada para transcrição automaticamente.
- No balão de áudio (`MessageBubble`) aparece, abaixo do player:
  - Estado "Transcrevendo..." (com spinner) enquanto pendente.
  - Texto transcrito quando concluído, com botão "Copiar" e selo discreto "Transcrição IA".
  - Em caso de falha: link "Tentar novamente" (apenas para atendentes).
- Áudios enviados pelo próprio atendente também são transcritos (útil para histórico/buscas).
- Áudios antigos (já existentes): botão manual "Transcrever" no balão para gerar sob demanda (sem reprocessar 307 áudios automaticamente).
- Toggle global em **Configurações de IA** para ligar/desligar a feature por tenant.

---

### 2. Banco de dados (migration)

**Em `mensagens.metadata` (jsonb já existente)** — sem nova coluna, padronizamos as chaves:
- `transcricao_status`: `pendente | processando | concluido | erro | desativado`
- `transcricao_texto`: string
- `transcricao_idioma`: string (ex: `pt`)
- `transcricao_modelo`: string
- `transcricao_processado_em`: ISO timestamp
- `transcricao_erro`: string

**Em `ia_config`** — adicionar:
- `transcricao_audio_ativo boolean not null default true`
- `transcricao_audio_idioma text default 'pt'` (auto-detect quando vazio)

**Trigger `enfileirar_transcricao_audio`** em `AFTER INSERT ON mensagens`:
- Se `tipo = 'audio'`, se `ia_config.transcricao_audio_ativo = true` para o tenant, e se `metadata->>'transcricao_status'` é nulo → setar `metadata.transcricao_status = 'pendente'`.
- Não chama edge function diretamente (cron faz polling).

**Índice parcial** para o worker:
```sql
CREATE INDEX idx_mensagens_transc_pendente
ON public.mensagens ((metadata->>'transcricao_status'))
WHERE tipo = 'audio' AND metadata->>'transcricao_status' IN ('pendente','processando');
```

---

### 3. Edge Function `transcrever-audio`

`supabase/functions/transcrever-audio/index.ts` (`verify_jwt = false`, chamada por cron e por usuário autenticado para retry manual).

Fluxo:
1. **Modo batch (cron)**: busca até 10 mensagens com `transcricao_status = 'pendente'`, marca como `processando`.
2. **Modo manual**: recebe `{ mensagem_id }` no body, valida JWT do usuário e tenant antes de processar.
3. Para cada mensagem:
   - Baixa o áudio do `conteudo` (URL pública — Z-API/Cloud/Storage).
   - Converte para base64 e envia ao **Lovable AI Gateway** com `google/gemini-2.5-flash` (suporta áudio inline) usando prompt:
     > "Transcreva este áudio fielmente em {idioma}. Retorne apenas o texto, sem comentários. Se houver múltiplos falantes, ignore separação."
   - Atualiza `metadata` com `transcricao_status='concluido'`, texto e timestamp.
   - Em erro: `transcricao_status='erro'`, `transcricao_erro=msg`, com retry máx. 3.
4. Trata 429 (rate limit → reagenda) e 402 (créditos esgotados → marca `erro` e loga).

**Cron**: `pg_cron` a cada 1 minuto chamando a função (insert via tool, não migration, pois usa URL e anon key específicos do projeto).

---

### 4. Frontend

**`MessageBubble.tsx`** — quando `tipo === 'audio'`, abaixo do `<audio>` renderizar bloco condicional:

```text
[player de áudio]
─────────────────
[ícone] Transcrição IA
"Olá, gostaria de saber sobre o pedido..."
[Copiar]  [Tentar novamente — se erro]
```

Estados visuais:
- `pendente`/`processando`: texto cinza com spinner pequeno "Transcrevendo áudio…"
- `concluido`: texto normal, botão copiar
- `erro`: texto vermelho discreto + botão retry (chama edge function com `mensagem_id`)
- `desativado` ou ausente em áudio antigo: botão "Transcrever" sob demanda

Realtime: a página `Conversas.tsx` já assina `postgres_changes` em `mensagens` — precisa também escutar `UPDATE` para refletir mudança de `metadata` quando a transcrição conclui.

**`IAConfig.tsx`** — novo card "Transcrição de áudios":
- Switch ativar/desativar
- Select de idioma (Português, Espanhol, Inglês, Auto-detectar)
- Botão "Transcrever áudios pendentes" (lista os sem `transcricao_status` e enfileira em lote — limite 100 por clique).

---

### 5. Custos e proteções

- Áudios > 10 MB: rejeitados com `transcricao_status='erro'` e mensagem clara (limite do gateway).
- Áudios > 5 minutos: aviso no log (não bloqueia).
- Não transcreve áudios enviados por bots/fluxos automatizados (`remetente='bot'` skip opcional — incluído como flag na config; default: transcreve tudo).
- Não há reprocessamento automático dos 307 áudios existentes — usuário escolhe via botão "Transcrever pendentes" ou clicando em cada áudio antigo.

---

### Resumo técnico

| Camada | Arquivo | Mudança |
|---|---|---|
| Migration | nova | colunas em `ia_config`, trigger `enfileirar_transcricao_audio`, índice parcial |
| Cron | insert SQL | job `pg_cron` a cada 1min → `transcrever-audio` |
| Edge Function | `supabase/functions/transcrever-audio/index.ts` | nova — batch + manual |
| Config | `supabase/config.toml` | registrar função com `verify_jwt = false` |
| UI | `src/components/conversas/MessageBubble.tsx` | bloco de transcrição sob player |
| UI | `src/pages/Conversas.tsx` | escutar UPDATE em mensagens (realtime) |
| UI | `src/pages/IAConfig.tsx` | card de configuração |
| Types | `src/integrations/supabase/types.ts` | regenerado automaticamente |

Posso seguir com a implementação?