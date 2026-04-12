
# Indicador Visual de Status da Conversa (Aberta/Fechada)

## Problema
Na lista de conversas, não há nenhum indicador visual que diferencie conversas abertas de fechadas. O status é recebido como prop mas nunca renderizado.

## Solução
Adicionar um pequeno ícone de status ao lado do nome do contato no `ConversaItem`:
- **Aberta**: ícone `MessageCircle` (lucide) em verde (`text-green-500`)
- **Fechada**: ícone `CheckCircle2` (lucide) em cinza (`text-muted-foreground`)

O ícone ficará antes do nome do contato, na mesma linha do ícone de "aguardando humano" (quando existir).

## Alteração

### `src/components/conversas/ConversaItem.tsx`

- Importar `MessageCircle` e `CheckCircle2` de lucide-react
- Na linha do nome, antes do `{nomeContato}`, adicionar:
  ```tsx
  {status === "fechada" ? (
    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
  ) : (
    <MessageCircle className="h-3.5 w-3.5 shrink-0 text-green-500" />
  )}
  ```
- O ícone de `aguardandoHumano` (UserRound amber) continua aparecendo quando aplicável, ao lado do ícone de status

## Arquivos

| Arquivo | Alteração |
|---------|-----------|
| `src/components/conversas/ConversaItem.tsx` | Adicionar ícones de status aberta/fechada |

Apenas 1 arquivo alterado — sem migrations ou mudanças de lógica.
