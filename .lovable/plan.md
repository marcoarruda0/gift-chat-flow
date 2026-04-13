

# Nó "Transferir" — Vincular com Departamentos e Membros da Equipe

## Problema
O nó "Transferir" no editor de fluxos usa um campo de texto livre para departamento. Deveria mostrar selects com os departamentos e membros cadastrados no sistema.

## Solução

### Arquivo: `src/components/fluxos/NodeConfigPanel.tsx`

1. **Adicionar state + fetch** para carregar departamentos e membros do tenant via Supabase ao montar o componente
2. **Substituir o bloco `transferir`** (linhas 209-220) por:
   - Select "Tipo de transferência": `departamento` ou `membro`
   - Se `departamento`: Select populado com departamentos do banco (`departamentos` table)
   - Se `membro`: Select populado com profiles do tenant (`profiles` table)
   - Textarea para mensagem de transferência (já existe)

3. **Imports necessários**: adicionar `useEffect, useState` do React e `supabase` client. Também precisar extrair `tenant_id` do `AuthContext`.

### Config armazenada
```typescript
{
  tipo_transferencia: "departamento" | "membro",
  departamento_id: uuid | null,
  membro_id: uuid | null,
  mensagem: string
}
```

### Visualização no painel
```text
Tipo de transferência: [Departamento ▼]
Departamento:          [Vendas ▼]
Mensagem:              [textarea]
```

### Arquivos afetados
| Arquivo | Mudança |
|---------|---------|
| `NodeConfigPanel.tsx` | Adicionar fetch de departamentos/membros + substituir inputs por selects |

Nenhuma mudança de banco necessária — os dados já existem nas tabelas `departamentos` e `profiles`.

