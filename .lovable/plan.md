

# Plano: Filtro por Segmento em Disparos + Nome do Segmento em Contatos

## 1. Disparos — novo filtro "Segmento RFV"

Hoje a aba RFV em Disparos só permite filtrar por nota mínima R/F/V individual. Vou adicionar um **seletor de Segmento** no topo do bloco RFV que, quando escolhido, filtra contatos pela faixa de soma daquele segmento (Campeões 13-15, Leais 10-12, etc.) — uma seleção só, mais intuitiva que mexer nos 3 sliders.

**Comportamento:**
- Novo `Select` "Segmento" com opções: "Personalizado (R/F/V)" + os 6 segmentos nomeados (de `SEGMENTOS_ORDENADOS`, exceto "Sem dados")
- Se "Personalizado" → mostra os 3 selects R/F/V atuais (comportamento de hoje)
- Se um segmento → oculta os selects R/F/V e filtra contatos cuja `getSegmentoBySoma(r,f,v).key` bate com o escolhido
- `filtro_valor` salvo na campanha:
  - Personalizado: `["r:X", "f:Y", "v:Z"]` (igual hoje)
  - Segmento: `["seg:campeoes"]` (novo formato)

**Mudança no `contatosFiltrados`:** quando segmento selecionado, usa `getSegmentoBySoma` para classificar e comparar com a key escolhida.

**Tipo `Contato`:** adicionar opcionalmente `rfv_soma` no select (não é estritamente necessário — calculamos client-side via `getSegmentoBySoma`, que já cobre nulls).

## 2. Backend `enviar-campanha` — suportar novo formato

Edge function precisa entender `filtro_valor: ["seg:campeoes"]`:
- Detecta prefixo `seg:` → busca contatos do tenant cujo `rfv_soma` está na faixa do segmento
- Faixas: campeoes ≥13, leais 10-12, potenciais 8-9, atencao 6-7, em_risco 4-5, perdidos =3
- Mantém compatibilidade com formato atual `r:`/`f:`/`v:`

## 3. Contatos — mostrar nome do segmento no badge

Hoje `RfvBadge` na lista de Contatos usa `compacto` (só "5-4-3"). Mudar para versão completa que já existe no componente: "5-4-3 · Campeões" com a cor do segmento. Em viewports pequenos pode ficar largo, então aplicar `max-w` + truncate no container da célula RFV.

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `src/pages/Disparos.tsx` | Novo Select "Segmento"; lógica condicional R/F/V vs segmento; `filtro_valor` com prefixo `seg:` |
| `supabase/functions/enviar-campanha/index.ts` | Suportar `filtro_valor` com `seg:<key>` filtrando por faixa de `rfv_soma` |
| `src/pages/Contatos.tsx` | Remover prop `compacto` do `RfvBadge` (mostrar nome do segmento) |

## Resultado

- **Disparos**: admin escolhe "Campeões" no dropdown → campanha envia só para clientes top, sem precisar configurar 3 sliders. Modo "Personalizado" continua disponível.
- **Contatos**: lista mostra "5-4-3 · Campeões" com cor do segmento, dando contexto imediato sem hover.

