## Objetivo

Melhorar o `CriarTemplateDialog` (módulo Templates / WhatsApp Oficial) para que o usuário:
1. **Veja e copie** facilmente as variáveis disponíveis para uso no corpo (e cabeçalho de texto) do template.
2. **Visualize um preview** em tempo real do template (estilo balão WhatsApp) antes de enviar para aprovação da Meta.

## Contexto técnico

Templates da Meta usam **placeholders posicionais** `{{1}}`, `{{2}}`, `{{3}}`... no `HEADER` (texto) e `BODY`. O usuário define exemplos para cada placeholder na hora da criação, e na hora do envio (campanhas, conversas, giftback) esses exemplos são substituídos pelas variáveis do contato (`{nome}`, `{telefone}`, etc.).

Hoje, no `CriarTemplateDialog.tsx`:
- O usuário tem que decorar a sintaxe `{{1}}`, `{{2}}` (apenas dica no placeholder do textarea).
- Não existe nenhum preview — só os campos isolados.

## Mudanças propostas

### 1. Painel de variáveis disponíveis (referência rápida)

Acima do campo **Corpo**, adicionar um bloco discreto explicando como funcionam as variáveis posicionais e listando atalhos clicáveis para inserir `{{1}}`, `{{2}}`, etc.

- Componente novo: `src/components/whatsapp-oficial/TemplateVariablesGuide.tsx`
  - Lista os placeholders **já usados** no corpo (ex: `{{1}}`, `{{2}}`) com badge "em uso".
  - Botão **"Inserir próxima variável"** que adiciona o próximo `{{N}}` no final do textarea.
  - Botão de **copiar** ao lado de cada `{{N}}` (usa `navigator.clipboard.writeText`).
  - Texto curto explicando: *"Use `{{1}}`, `{{2}}` no corpo. Você definirá um exemplo para cada um abaixo. No envio, eles serão substituídos por dados reais do contato."*
- Mesma lógica replicada (versão compacta) ao lado do campo **Cabeçalho** quando o tipo for `TEXT` (limitado a `{{1}}`, regra atual da Meta).
- Para inserir no textarea via botão, o componente recebe uma `ref` ao `<Textarea>` para inserir na posição do cursor (ou no final como fallback).

### 2. Painel de preview ao vivo (estilo WhatsApp)

Componente novo: `src/components/whatsapp-oficial/TemplatePreview.tsx`

Recebe via props o estado atual do formulário:
```
{ headerType, headerText, headerExample, headerMediaUrl,
  body, bodyExamples, footer, buttons }
```

Renderiza um **balão de mensagem** parecido com o WhatsApp (fundo verde-claro `#DCF8C6` em modo claro, com canto arredondado e sombra leve), contendo:

- **Cabeçalho**:
  - `TEXT` → texto em negrito, com `{{1}}` substituído por `headerExample` (ou `{{1}}` literal se vazio).
  - `IMAGE` → `<img src={headerMediaUrl}>` com `max-h-40 object-contain rounded-md`. Placeholder cinza com ícone se não houver upload.
  - `VIDEO` → `<video controls>` análogo.
  - `NONE` → omitido.
- **Corpo**: texto com `{{N}}` substituído por `bodyExamples[N-1]` (ou `{{N}}` literal se vazio). Preserva quebras de linha (`whitespace-pre-wrap`).
- **Rodapé**: texto cinza menor, abaixo do corpo.
- **Botões**: lista vertical separada com borda superior, cada botão renderizado como um link/botão estilizado WhatsApp (texto azul para `URL`, texto cinza para `QUICK_REPLY`); até 3, na ordem definida.
- **Hora**: pequeno timestamp falso `12:34 ✓✓` no canto inferior direito do balão (puramente visual).

O preview atualiza automaticamente sempre que o formulário muda (já que tudo é controlado por `useState`).

### 3. Layout do diálogo

- Aumentar `max-w-2xl` → `max-w-4xl` para acomodar layout de 2 colunas em telas médias+.
- Em `md:` ou maior: formulário à esquerda (col-span-2 ou ~60%), preview à direita (sticky, ~40%).
- Em telas pequenas: preview empilha abaixo do formulário (sem `sticky`).

### 4. Ajustes pequenos no formulário existente

- Substituir o placeholder atual do textarea Corpo por algo mais curto, já que a explicação agora vem do painel de variáveis.
- Manter toda a lógica atual de `countPlaceholders`, `bodyExamples`, validação e submit — **nada muda na lógica de envio à Meta**.

## Arquivos afetados

- **Novo**: `src/components/whatsapp-oficial/TemplateVariablesGuide.tsx`
- **Novo**: `src/components/whatsapp-oficial/TemplatePreview.tsx`
- **Modificado**: `src/components/whatsapp-oficial/CriarTemplateDialog.tsx`
  - Importar e renderizar os dois novos componentes.
  - Reorganizar layout em grid 2-colunas (md+).
  - Conectar `ref` do textarea para inserção de variável na posição do cursor.

## Fora de escopo (não muda agora)

- Lógica de envio à Meta (payload já está correto).
- Sincronização de templates aprovados (`TemplatesCard.tsx`) — preview já existe nos diálogos de uso.
- Suporte a botões `PHONE_NUMBER` ou `COPY_CODE` (mantém o que já há: `QUICK_REPLY` e `URL`).
- Variáveis dinâmicas do contato (`{nome}`, etc.) no preview da criação — aqui mostramos os **exemplos** que o usuário fornece, que é exatamente o que a Meta vê na aprovação.
