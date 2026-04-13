

# Permitir envio de arquivos RAR (e outros compactados) no módulo Conversas

## Problema

O componente `AttachmentButton` usa uma lista fixa de MIME types no atributo `accept` do input de arquivo. Arquivos `.rar`, `.zip`, `.7z` e outros compactados não estão na lista, então o seletor de arquivos do navegador os bloqueia.

## Solução

Expandir a constante `ACCEPT` em `AttachmentButton.tsx` para incluir formatos de arquivos compactados e outros tipos comuns:

| Arquivo | Mudança |
|---------|---------|
| `src/components/conversas/AttachmentButton.tsx` | Adicionar MIME types para RAR, ZIP, 7z e outros formatos comuns à constante `ACCEPT` |

### MIME types a adicionar

- `application/x-rar-compressed` e `application/vnd.rar` — RAR
- `application/zip` e `application/x-zip-compressed` — ZIP
- `application/x-7z-compressed` — 7z
- `application/gzip` — GZ
- `audio/*` e `video/*` — para flexibilidade com mídias

Mudança de uma única linha na constante `ACCEPT`.

