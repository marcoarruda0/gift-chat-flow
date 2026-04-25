# Sprint 5 — Hardening do Webhook + Health/Auditoria

## ✅ Implementado

### 1. Validação HMAC-SHA256
- Edge function `whatsapp-cloud-webhook` agora valida o header `X-Hub-Signature-256` contra `META_APP_SECRET` (Web Crypto, comparação constant-time).
- Se o secret **não estiver configurado**, segue funcionando como antes (modo "soft") e a UI sinaliza "HMAC desativado".
- Se o secret **estiver configurado** e a assinatura falhar: o evento é registrado em `whatsapp_webhook_eventos` com `status='erro'`, `erro_mensagem='hmac_invalido'`, `hmac_valido=false`, e o processamento é abortado (sem criar mensagens).

### 2. Idempotência reforçada
- Nova coluna `whatsapp_webhook_eventos.payload_hash` (SHA-256 do raw body).
- Índice único parcial `(tenant_id, payload_hash)` previne duplo-processamento.
- Se a Meta reenviar o mesmo evento, é gravado com `status='duplicado'` apontando para o evento original e nenhuma mensagem é recriada.

### 3. Métricas no DiagnosticoCard
- Eventos com erro nas últimas 24h
- Total de eventos nas últimas 24h
- Taxa de sucesso (% processado vs total)
- Badge de HMAC: válido / inválido / desativado

### 4. Filtros na AuditoriaCard
- Select de status: todos / processado / erro / duplicado / recebido
- Busca por `phone_number_id` (ilike)
- Paginação simples (25 por página, anterior/próxima)
- Ícone de HMAC por linha (✓/⚠/—)

## 📁 Arquivos
- **Migration**: `whatsapp_webhook_eventos` ganhou `payload_hash`, `hmac_valido` + 2 índices
- **Edge function**: `supabase/functions/whatsapp-cloud-webhook/index.ts` (HMAC + dedup)
- **Componentes**: `DiagnosticoCard.tsx` e `AuditoriaCard.tsx` ampliados
- **Página**: `WhatsappOficialConfig.tsx` carrega novas métricas
- **Secret**: `META_APP_SECRET` (opcional)

## 🧪 Como validar
1. Sem `META_APP_SECRET`: tudo segue funcionando, badge mostra "HMAC desativado".
2. Com secret correto: badge fica "HMAC válido" após próximo evento real.
3. Com secret incorreto: badge "HMAC inválido", eventos chegam mas não são processados (registrados como erro).
4. Reenvio de evento idêntico: aparece como `duplicado` na auditoria, sem criar mensagem dupla.
5. Filtros da auditoria: combinar status + busca por phone funciona; paginação navega.

## 🔐 Configuração do META_APP_SECRET
1. Meta App Dashboard → Settings → Basic → App Secret → Show
2. Já adicionado como secret no projeto.
3. Próximo evento da Meta validará automaticamente.
