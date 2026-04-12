

# Atraso Inteligente para Campanhas de Disparo

## Objetivo
Adicionar uma opção de "Atraso Inteligente" ao criar campanhas, permitindo ao usuário escolher o intervalo de tempo aleatório entre cada envio para reduzir risco de banimento no WhatsApp.

## Alterações

### 1. Migration — Nova coluna `atraso_tipo` na tabela `campanhas`

- `atraso_tipo` (text, default `'medio'`) — valores: `muito_curto`, `curto`, `medio`, `longo`, `muito_longo`

### 2. Frontend — Seletor no dialog de nova campanha (`Disparos.tsx`)

- Novo estado `atrasoTipo` (default `"medio"`)
- Adicionar `Select` com as 5 opções e descrição dos intervalos:
  - Muito Curto (1s a 5s)
  - Curto (5s a 20s)
  - Médio (20s a 60s)
  - Longo (60s a 180s)
  - Muito Longo (180s a 300s)
- Incluir `atraso_tipo` no insert da campanha
- Mostrar o atraso selecionado na tabela de campanhas (coluna ou tooltip)

### 3. Edge Function — Usar atraso da campanha (`enviar-campanha/index.ts`)

- Ler `campanha.atraso_tipo` do registro
- Mapear para intervalos em ms:
  ```
  muito_curto: [1000, 5000]
  curto: [5000, 20000]
  medio: [20000, 60000]
  longo: [60000, 180000]
  muito_longo: [180000, 300000]
  ```
- Substituir o delay fixo atual (`2000 + Math.random() * 2000`) pelo intervalo correspondente
- Primeira mensagem enviada sem atraso

### 4. Tipo `Campanha` no frontend

- Adicionar `atraso_tipo` ao type `Campanha`

## Arquivos criados/alterados

| Arquivo | Tipo |
|---------|------|
| Migration (coluna `atraso_tipo`) | Novo |
| `src/pages/Disparos.tsx` | Alterado (seletor + state + type) |
| `supabase/functions/enviar-campanha/index.ts` | Alterado (delay dinâmico) |

## Detalhes Técnicos

- O delay atual na edge function (linha ~196) é `2000 + Math.random() * 2000` — será substituído por `min + Math.random() * (max - min)` baseado no `atraso_tipo`
- A primeira mensagem do loop (index 0) é enviada imediatamente, sem espera
- O delay é aplicado **antes** de enviar cada mensagem subsequente, conforme o exemplo prático descrito

