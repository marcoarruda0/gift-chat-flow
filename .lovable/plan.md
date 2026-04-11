

# Melhorias: Transferência Humana + Preview da IA

## 1. Transferência automática quando IA responde SEM_INFO

**No webhook (`zapi-webhook/index.ts`)**, onde hoje temos `console.log("AI had no relevant answer, skipping auto-reply")` (linha 314), vamos:

- Enviar mensagem ao contato: "Não consegui encontrar essa informação. Vou transferir você para um atendente humano 🙏"
- Salvar essa mensagem no banco como `remetente: "bot"`
- Marcar a conversa com um novo campo `aguardando_humano: true` para que o atendente saiba que precisa intervir
- Incrementar `nao_lidas` da conversa para chamar atenção na lista

**Migration**: Adicionar coluna `aguardando_humano boolean default false` na tabela `conversas`.

**UI (`ConversaItem.tsx`)**: Mostrar indicador visual (ícone de pessoa) quando `aguardando_humano = true`.

## 2. Preview/Simulação na página Config IA

**Na página `IAConfig.tsx`**, adicionar um card "Testar IA" com:
- Input para digitar uma pergunta de teste
- Botão "Simular Resposta"
- Chama a edge function `ai-responder` (já existente) passando a pergunta + configurações atuais do formulário (não as salvas)
- Exibe a resposta em um balão estilo WhatsApp abaixo

**Na edge function `ai-responder/index.ts`**, ajustar para aceitar parâmetros de personalidade opcionais (`nome_assistente`, `tom`, `usar_emojis`, `instrucoes_extras`) no body, usando-os em vez de buscar do banco. Assim o preview usa as configs do formulário antes de salvar.

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| Migration | Adicionar `aguardando_humano` em `conversas` |
| `supabase/functions/zapi-webhook/index.ts` | Enviar msg de transferência + marcar conversa quando SEM_INFO |
| `supabase/functions/ai-responder/index.ts` | Aceitar params de personalidade para preview |
| `src/pages/IAConfig.tsx` | Adicionar card de simulação/preview |
| `src/components/conversas/ConversaItem.tsx` | Indicador visual de aguardando humano |

