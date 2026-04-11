

# Preview de Áudio e Vídeo no Dialog de Campanha

## Alteração

Arquivo único: `src/pages/Disparos.tsx`, linhas 422-424.

Expandir o bloco de preview (que hoje só tem imagem) para incluir:
- **Vídeo**: `<video>` com `controls` e `max-h-40`
- **Áudio**: `<audio>` com `controls` e largura total

### Código atual (linha 422-424):
```tsx
{tipoMidia === "imagem" && midiaUrl && (
  <img src={midiaUrl} alt="Preview" className="mt-2 rounded max-h-40 object-contain" />
)}
```

### Será substituído por:
```tsx
{midiaUrl && tipoMidia === "imagem" && (
  <img src={midiaUrl} alt="Preview" className="mt-2 rounded max-h-40 object-contain" />
)}
{midiaUrl && tipoMidia === "video" && (
  <video src={midiaUrl} controls className="mt-2 rounded max-h-40 w-full" />
)}
{midiaUrl && tipoMidia === "audio" && (
  <audio src={midiaUrl} controls className="mt-2 w-full" />
)}
```

Nenhuma migration, nenhum arquivo novo. Apenas 3 linhas viram 9.

