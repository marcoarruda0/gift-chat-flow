

# Melhorias nos Nós "Conteúdo" e "Atraso" do Editor de Fluxos

## 1. Nó "Conteúdo" — Upload de mídia

Atualmente, ao selecionar tipo "Imagem", "Áudio" ou "Vídeo", só aparece o campo de texto. Vamos adicionar um campo de upload de arquivo que salva no storage e guarda a URL no config.

**Mudança em `NodeConfigPanel.tsx`:**
- Quando `config.tipo` for `imagem`, `audio` ou `video`: mostrar um campo `<input type="file">` com accept adequado (`.jpg,.png,.gif,.webp` / `.mp3,.m4a,.ogg` / `.mp4,.mov,.webm`)
- Ao selecionar arquivo, fazer upload para o bucket `chat-media` via Supabase storage em `{tenant_id}/fluxos/{filename}`
- Salvar a URL pública em `config.media_url`
- Mostrar preview da mídia (imagem inline, nome do arquivo para áudio/vídeo)
- Manter o campo "Corpo da mensagem" como legenda opcional

## 2. Nó "Atraso" — Adicionar opção "Dias"

**Mudança em `NodeConfigPanel.tsx` (linhas ~163-170):**
- Adicionar `<SelectItem value="dia">Dias</SelectItem>` no Select de unidade do nó `atraso`

## Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| `src/components/fluxos/NodeConfigPanel.tsx` | Upload de mídia no nó conteúdo; opção "Dias" no nó atraso |

