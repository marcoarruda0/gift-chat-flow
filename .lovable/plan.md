

# Upload em Massa de Conversas Antigas (formato Wondershare .txt)

## Visão geral

Criar uma funcionalidade para importar arquivos .txt exportados pelo Wondershare, parseando o formato específico e inserindo as mensagens no banco como histórico da conversa. O arquivo é nomeado com o telefone do contato, o que permite vincular automaticamente ao contato existente (ou criar um novo).

## Formato do arquivo

```text
iPhone(+55 11 99493-5647)           ← linha 1: telefone do contato
------------------------------------← linha 2: separador
2024/11/27 23:33                    ← timestamp
Peça Rara Tatuapé:                  ← remetente = empresa (mensagem enviada)
Oiiii Alessandra, tudo bem???       ← conteúdo (pode ser multi-linha)

2024/12/03 15:49                    ← timestamp
+5511994935647:                     ← remetente = contato (mensagem recebida)
Oi                                  ← conteúdo

2025/05/20 12:16                    ← timestamp
Peça Rara Tatuapé:                  ← empresa
*Mariane Souto:*                    ← nome do atendente (opcional)
Boa tarde, Alessandra...            ← conteúdo
```

Regras de parse:
- Linha com `+55...` ou `+número:` = mensagem **recebida** (remetente = `contato`)
- Linha com nome da empresa (ex: "Peça Rara Tatuapé:") = mensagem **enviada** (remetente = `atendente`)
- Linha com `*NomeAtendente:*` logo após a empresa = metadata do atendente
- Conteúdos como "Áudio", "Vídeo", "Fotos", "Arquivos", "Chamada de Voz" = tipo especial (registrar como texto informativo)

## Mudanças

### 1. Edge Function `importar-conversas` (novo)
- Recebe o conteúdo do arquivo .txt + tenant_id
- Parseia o formato Wondershare
- Extrai telefone da primeira linha
- Busca ou cria o contato pelo telefone
- Busca ou cria a conversa para esse contato
- Insere todas as mensagens em batch com os timestamps originais
- Retorna resumo: total de mensagens importadas, contato vinculado

### 2. Componente `ImportarConversasDialog` (novo)
- Dialog com área de upload (aceita .txt)
- Suporte a múltiplos arquivos (um por contato)
- Mostra preview: telefone detectado, total de mensagens, período
- Botão "Importar" que chama a edge function
- Progress bar durante importação

### 3. Integração na página Conversas
- Botão "Importar histórico" na barra superior da lista de conversas (ao lado do botão "Nova conversa")
- Ícone `Upload` do lucide

### Arquivos afetados

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `supabase/functions/importar-conversas/index.ts` | Novo | Parser + inserção em batch |
| `src/components/conversas/ImportarConversasDialog.tsx` | Novo | UI de upload e preview |
| `src/pages/Conversas.tsx` | Editar | Adicionar botão e dialog de importação |

### Detalhes técnicos

- O parser no edge function usa regex para identificar blocos: `^(\d{4}/\d{2}/\d{2} \d{2}:\d{2})$` para timestamps
- Mensagens são inseridas com `created_at` igual ao timestamp original do arquivo
- Usa service role para inserir com timestamps customizados
- Limita a 5000 mensagens por arquivo para evitar timeout
- Telefone normalizado para formato `55XXXXXXXXXXX` antes de buscar contato

